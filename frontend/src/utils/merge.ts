import { db } from './db';
import { uid } from './id';
import { toPlain } from './plain';
import type { Table } from 'dexie';
import type { RingRecord } from '../types/ring-record';
import type { Morphometrics } from '../types/morphometrics';
import type { BirdSite } from '../types/bird-site';
import type { SurveySession } from '../types/session';
import type { ConflictStatus } from '../types/source';

/**
 * 摘录包（野外小组离线登记后带回站里合并的交换格式）。
 * 纯前端应用无后端，摘录包即一份 JSON 文件：野外端「导出摘录包」，站里「导入摘录包」。
 */
export interface ExcerptPackage {
  app: 'gbbirdring-excerpt';
  formatVersion: 1;
  packageId: string;
  /** 来源设备 / 野外小组 */
  device: string;
  exportedAt: string;
  rings: RingRecord[];
  morphs: Morphometrics[];
  sites: BirdSite[];
  sessions: SurveySession[];
}

export interface MergeCounts {
  added: number;
  conflicts: number;
  skipped: number;
}
export interface SiteMergeCounts extends MergeCounts {
  pending: number;
}
export interface MorphMergeCounts {
  added: number;
  skipped: number;
}

export interface MergeResult {
  packageId: string;
  device: string;
  exportedAt: string;
  importedAt: string;
  counts: {
    rings: MergeCounts;
    morphs: MorphMergeCounts;
    sites: SiteMergeCounts;
    sessions: MergeCounts;
  };
  /** 本次新产生的冲突组 id */
  newConflictGroups: string[];
  /** 本次新增的待确认鸟点 id */
  newPendingSiteIds: string[];
}

/** 比对业务字段时忽略的元数据字段（来源 / 冲突 / id） */
const META_FIELDS = ['id', 'source', 'mergeId', 'conflictGroup', 'conflictStatus', 'pending'] as const;

function stripMeta<T>(record: T): T {
  const copy: Record<string, unknown> = { ...(record as Record<string, unknown>) };
  for (const f of META_FIELDS) delete copy[f];
  return copy as T;
}

/** 业务字段完全一致 → 视为同一条记录（用于幂等去重） */
function businessEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(stripMeta(a)) === JSON.stringify(stripMeta(b));
}

/** 自然键归一化（去空格 + 小写） */
const norm = (v: string): string => (v ?? '').trim().toLowerCase();

type ConflictRow = {
  id: string;
  conflictGroup?: string;
  conflictStatus?: ConflictStatus;
  pending?: boolean;
};

/** 同自然键已有版本时，取当前有效版本（用于 id 重映射） */
function activeOf<T extends ConflictRow>(existing: T[]): T {
  return existing.find((r) => !r.conflictStatus || r.conflictStatus === 'active') ?? existing[0];
}

/**
 * 为冲突的两版分配同一个冲突组，并把已有版本纳入组（已有版本保持有效）。
 * 已在组内则复用组 id。
 */
async function ensureGroup<T extends ConflictRow>(table: Table<T, string>, existing: T[], prefix: string): Promise<string> {
  const inGroup = existing.find((r) => r.conflictGroup);
  if (inGroup?.conflictGroup) return inGroup.conflictGroup;
  const group = uid(`cf-${prefix}`);
  for (const r of existing) {
    r.conflictGroup = group;
    if (!r.conflictStatus) r.conflictStatus = 'active';
    await table.put(toPlain(r));
  }
  return group;
}

function parsePackage(text: string): ExcerptPackage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('摘录包不是合法 JSON 文件');
  }
  const p = parsed as Partial<ExcerptPackage>;
  if (!p || p.app !== 'gbbirdring-excerpt') {
    throw new Error('摘录包格式不匹配（缺少 app=gbbirdring-excerpt 标记）');
  }
  const need: Array<[string, unknown]> = [
    ['rings', p.rings],
    ['morphs', p.morphs],
    ['sites', p.sites],
    ['sessions', p.sessions],
  ];
  for (const [name, value] of need) {
    if (!Array.isArray(value)) throw new Error(`摘录包内容不完整（缺少 ${name} 数组）`);
  }
  return {
    app: 'gbbirdring-excerpt',
    formatVersion: p.formatVersion ?? 1,
    packageId: p.packageId || uid('excerpt'),
    device: (p.device || '未知设备').trim() || '未知设备',
    exportedAt: p.exportedAt || '',
    rings: p.rings as RingRecord[],
    morphs: p.morphs as Morphometrics[],
    sites: p.sites as BirdSite[],
    sessions: p.sessions as SurveySession[],
  };
}

/** 导出摘录包：本站（主台账设备）录入的记录 source='local'，合并来的不再回传 */
export async function buildExcerpt(device: string): Promise<ExcerptPackage> {
  const [rings, morphs, sites, sessions] = await Promise.all([
    db.rings.toArray(),
    db.morphs.toArray(),
    db.sites.toArray(),
    db.sessions.toArray(),
  ]);
  return {
    app: 'gbbirdring-excerpt',
    formatVersion: 1,
    packageId: uid('excerpt'),
    device: device.trim() || '未知设备',
    exportedAt: new Date().toISOString(),
    rings: rings.filter((r) => r.source === 'local'),
    morphs: morphs.filter((m) => m.source === 'local'),
    sites: sites.filter((s) => s.source === 'local'),
    sessions: sessions.filter((s) => s.source === 'local'),
  };
}

/**
 * 导入摘录包并合并进主台账。
 *
 * 规则：
 * - 同自然键（环号 / 点位号 / 批次号）业务字段完全一致 → 已并进去，跳过（幂等）
 * - 同自然键但内容不一致 → 同一只鸟两边都改过，保留两版并标来源，站里定用哪版
 * - 新鸟点（台账无对应点位号）→ 挂「待确认」，不进正式统计
 * - 新环志 / 批次 → 直接并入，标 source='merge'
 *
 * 全部写入在一个 Dexie 事务内：失败整体回滚，可安全重试，不会重复记两次。
 */
export async function importExcerpt(text: string): Promise<MergeResult> {
  const pkg = parsePackage(text);
  const importedAt = new Date().toISOString();

  const [localRings, localMorphs, localSites, localSessions] = await Promise.all([
    db.rings.toArray(),
    db.morphs.toArray(),
    db.sites.toArray(),
    db.sessions.toArray(),
  ]);

  const counts: MergeResult['counts'] = {
    rings: { added: 0, conflicts: 0, skipped: 0 },
    morphs: { added: 0, skipped: 0 },
    sites: { added: 0, pending: 0, conflicts: 0, skipped: 0 },
    sessions: { added: 0, conflicts: 0, skipped: 0 },
  };
  const newConflictGroups: string[] = [];
  const newPendingSiteIds: string[] = [];

  // 摘录包 id -> 本地 id 重映射（鸟点 → 批次 → 环志 → 量度）
  const siteIdMap = new Map<string, string>();
  const sessionIdMap = new Map<string, string>();
  const ringIdMap = new Map<string, string>();

  await db.transaction('rw', db.rings, db.morphs, db.sites, db.sessions, async () => {
    // 1. 鸟点
    for (const incoming of pkg.sites) {
      const key = norm(incoming.siteNo);
      const existing = localSites.filter((s) => norm(s.siteNo) === key);
      if (existing.some((s) => businessEqual(s, incoming))) {
        counts.sites.skipped += 1;
        siteIdMap.set(incoming.id, activeOf(existing).id);
        continue;
      }
      if (existing.length > 0) {
        // 点位号已存在但内容不同 → 两版都保留，挂起待裁决
        const group = await ensureGroup(db.sites, existing, 'site');
        const record: BirdSite = {
          ...toPlain(incoming),
          id: uid('site'),
          source: 'merge',
          mergeId: pkg.packageId,
          pending: true,
          conflictGroup: group,
          conflictStatus: 'pending',
        };
        await db.sites.put(toPlain(record));
        localSites.push(record);
        siteIdMap.set(incoming.id, record.id);
        counts.sites.conflicts += 1;
        newConflictGroups.push(group);
        newPendingSiteIds.push(record.id);
      } else {
        // 新点位 → 待确认，不进正式统计
        const record: BirdSite = {
          ...toPlain(incoming),
          id: uid('site'),
          source: 'merge',
          mergeId: pkg.packageId,
          pending: true,
          conflictStatus: 'active',
        };
        await db.sites.put(toPlain(record));
        localSites.push(record);
        siteIdMap.set(incoming.id, record.id);
        counts.sites.pending += 1;
        newPendingSiteIds.push(record.id);
      }
    }

    // 2. 调查批次
    for (const incoming of pkg.sessions) {
      const key = norm(incoming.sessionNo);
      const existing = localSessions.filter((s) => norm(s.sessionNo) === key);
      // 比对前先把摘录包的 siteId 重映射为本地 id，避免引用 id 差异造成误判
      const siteId = siteIdMap.get(incoming.siteId) ?? incoming.siteId;
      const incomingRemapped = { ...incoming, siteId };
      if (existing.some((s) => businessEqual(s, incomingRemapped))) {
        counts.sessions.skipped += 1;
        sessionIdMap.set(incoming.id, activeOf(existing).id);
        continue;
      }
      if (existing.length > 0) {
        const group = await ensureGroup(db.sessions, existing, 'session');
        const record: SurveySession = {
          ...toPlain(incoming),
          id: uid('session'),
          siteId,
          source: 'merge',
          mergeId: pkg.packageId,
          conflictGroup: group,
          conflictStatus: 'pending',
        };
        await db.sessions.put(toPlain(record));
        localSessions.push(record);
        sessionIdMap.set(incoming.id, record.id);
        counts.sessions.conflicts += 1;
        newConflictGroups.push(group);
      } else {
        const record: SurveySession = {
          ...toPlain(incoming),
          id: uid('session'),
          siteId,
          source: 'merge',
          mergeId: pkg.packageId,
          conflictStatus: 'active',
        };
        await db.sessions.put(toPlain(record));
        localSessions.push(record);
        sessionIdMap.set(incoming.id, record.id);
        counts.sessions.added += 1;
      }
    }

    // 3. 环志记录
    for (const incoming of pkg.rings) {
      const key = norm(incoming.ringNo);
      const existing = localRings.filter((r) => norm(r.ringNo) === key);
      // 比对前先把摘录包的 siteId / sessionId 重映射为本地 id
      const siteId = siteIdMap.get(incoming.siteId) ?? incoming.siteId;
      const sessionId = sessionIdMap.get(incoming.sessionId) ?? incoming.sessionId;
      const incomingRemapped = { ...incoming, siteId, sessionId };
      if (existing.some((r) => businessEqual(r, incomingRemapped))) {
        counts.rings.skipped += 1;
        ringIdMap.set(incoming.id, activeOf(existing).id);
        continue;
      }
      if (existing.length > 0) {
        // 同一只鸟两边都改过 → 保留两版，标来源，站里定用哪版
        const group = await ensureGroup(db.rings, existing, 'ring');
        const record: RingRecord = {
          ...toPlain(incoming),
          id: uid('ring'),
          siteId,
          sessionId,
          source: 'merge',
          mergeId: pkg.packageId,
          conflictGroup: group,
          conflictStatus: 'pending',
        };
        await db.rings.put(toPlain(record));
        localRings.push(record);
        ringIdMap.set(incoming.id, record.id);
        counts.rings.conflicts += 1;
        newConflictGroups.push(group);
      } else {
        const record: RingRecord = {
          ...toPlain(incoming),
          id: uid('ring'),
          siteId,
          sessionId,
          source: 'merge',
          mergeId: pkg.packageId,
          conflictStatus: 'active',
        };
        await db.rings.put(toPlain(record));
        localRings.push(record);
        ringIdMap.set(incoming.id, record.id);
        counts.rings.added += 1;
      }
    }

    // 4. 量度记录（同一环志可多次量度，附加即可；按重映射后的 ringId 去重）
    for (const incoming of pkg.morphs) {
      const ringId = ringIdMap.get(incoming.ringId) ?? incoming.ringId;
      const dup = localMorphs.some((m) => m.ringId === ringId && businessEqual({ ...m, ringId }, { ...incoming, ringId }));
      if (dup) {
        counts.morphs.skipped += 1;
        continue;
      }
      const record: Morphometrics = {
        ...toPlain(incoming),
        id: uid('morph'),
        ringId,
        source: 'merge',
        mergeId: pkg.packageId,
      };
      await db.morphs.put(toPlain(record));
      localMorphs.push(record);
      counts.morphs.added += 1;
    }
  });

  return {
    packageId: pkg.packageId,
    device: pkg.device,
    exportedAt: pkg.exportedAt,
    importedAt,
    counts,
    newConflictGroups: [...new Set(newConflictGroups)],
    newPendingSiteIds: [...new Set(newPendingSiteIds)],
  };
}

/** 裁决冲突：选定一版为有效，其余版本废弃 */
export async function resolveConflict(groupId: string, chosenId: string): Promise<void> {
  await db.transaction('rw', db.rings, db.sites, db.sessions, async () => {
    const [rings, sites, sessions] = await Promise.all([
      db.rings.where('conflictGroup').equals(groupId).toArray(),
      db.sites.where('conflictGroup').equals(groupId).toArray(),
      db.sessions.where('conflictGroup').equals(groupId).toArray(),
    ]);
    for (const record of rings) {
      const chosen = record.id === chosenId;
      record.conflictStatus = chosen ? 'active' : 'superseded';
      await db.rings.put(toPlain(record));
    }
    for (const record of sites) {
      const chosen = record.id === chosenId;
      record.conflictStatus = chosen ? 'active' : 'superseded';
      record.pending = chosen ? false : true;
      await db.sites.put(toPlain(record));
    }
    for (const record of sessions) {
      const chosen = record.id === chosenId;
      record.conflictStatus = chosen ? 'active' : 'superseded';
      await db.sessions.put(toPlain(record));
    }
  });
}

/** 确认待确认鸟点（若该点属冲突组，则等同裁定选用此版） */
export async function confirmSite(siteId: string): Promise<void> {
  const site = await db.sites.get(siteId);
  if (!site) return;
  if (site.conflictGroup) {
    await resolveConflict(site.conflictGroup, siteId);
  } else {
    site.pending = false;
    await db.sites.put(toPlain(site));
  }
}

/** 删除待确认鸟点 */
export async function discardSite(siteId: string): Promise<void> {
  await db.sites.delete(siteId);
}
