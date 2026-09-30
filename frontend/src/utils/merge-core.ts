/**
 * 摘录包合并纯逻辑（不依赖 Dexie / DOM，可在 node 下单测）。
 *
 * 匹配口径：
 * - 鸟点按点位编号 siteNo、批次按批次号 sessionNo 对齐（编号相同即同一对象，用于 id 重映射）；
 * - 环志记录先按 id 对齐（离线设备由台账快照派生，编辑保留原 id），
 *   id 对不上时再按「同环号 + 环志日期 + 网号 + 网次 + 状态」事件指纹对齐，避免把重捕/回收误判成冲突；
 * - 同一条事件两边内容一致 → 跳过（幂等、不重复记）；内容都改过 → 留两版、标来源、默认采用站里版；
 * - 指纹也对不上的同环号记录视为一次新的捕捉事件（如新的重捕），直接并为正式版。
 */
import { uid } from './id';
import type { RingRecord } from '../types/ring-record';
import type { BirdSite } from '../types/bird-site';
import type { SurveySession } from '../types/session';
import type { Morphometrics } from '../types/morphometrics';
import type { ExtractPackage } from '../types/source';

const norm = (value: unknown): string => String(value ?? '').trim().toLowerCase();

/** 环志记录参与比对的业务字段（不含 id / 来源 / 审计字段，siteId、sessionId 已先做 id 重映射） */
const RING_COMPARE_FIELDS: Array<keyof RingRecord> = [
  'ringNo',
  'colorRing',
  'speciesCn',
  'speciesSci',
  'age',
  'ringDate',
  'netNo',
  'netRound',
  'status',
  'ringer',
  'siteId',
  'sessionId',
  'remark',
];

const MORPH_COMPARE_FIELDS: Array<keyof Morphometrics> = [
  'billLength',
  'billWidth',
  'wingLength',
  'tailLength',
  'tarsusLength',
  'weight',
  'fatScore',
  'measuredBy',
  'measuredAt',
];

export function ringFingerprint(ring: Pick<RingRecord, 'ringNo' | 'ringDate' | 'netNo' | 'netRound' | 'status'>): string {
  return [norm(ring.ringNo), norm(ring.ringDate), norm(ring.netNo), String(ring.netRound ?? ''), norm(ring.status)].join('|');
}

function sameByFields<T extends object>(a: T, b: T, fields: Array<keyof T>): boolean {
  return fields.every((field) => String(a[field] ?? '') === String(b[field] ?? ''));
}

export interface ConflictPair {
  groupId: string;
  /** 站里主台账版本（默认采用） */
  station: RingRecord;
  /** 野外摘录包版本（默认留档，站里可切换采用） */
  field: RingRecord;
}

export interface MergePlan {
  origin: string;
  exportedAt: string;
  packageId: string;
  sitesToPut: BirdSite[];
  sessionsToPut: SurveySession[];
  /** 新增环志（新鸟或新的捕捉事件，直接进正式结果） */
  ringsToAdd: RingRecord[];
  /** 冲突留版需要更新的站里原记录（补 conflictGroup） */
  stationRingsToUpdate: RingRecord[];
  /** 冲突留版写入的野外版本（superseded，等待站里定版） */
  fieldRingsToAdd: RingRecord[];
  conflicts: ConflictPair[];
  morphsToPut: Morphometrics[];
  /** 内容一致跳过的环志条数 / 孤儿量度条数 */
  skippedRings: number;
  skippedMorphs: number;
  newSiteCount: number;
  pendingSiteCount: number;
  newSessionCount: number;
}

interface Ledger {
  rings: RingRecord[];
  sites: BirdSite[];
  sessions: SurveySession[];
  morphs: Morphometrics[];
}

type PkgRing = RingRecord;
type PkgSite = BirdSite;
type PkgSession = SurveySession;
type PkgMorph = Morphometrics;

/**
 * 计算摘录包合并计划（纯函数）。
 * @param now 合并时间 ISO（由调用方传入，便于测试）
 */
export function planMerge(existing: Ledger, pkg: ExtractPackage, now: string): MergePlan {
  const origin = String(pkg.origin || '野外小组').trim() || '野外小组';
  const stamp = { source: 'field' as const, origin, packageId: pkg.packageId, mergedAt: now };

  const sitesToPut: BirdSite[] = [];
  const sessionsToPut: SurveySession[] = [];
  const ringsToAdd: RingRecord[] = [];
  const stationRingsToUpdate: RingRecord[] = [];
  const fieldRingsToAdd: RingRecord[] = [];
  const morphsToPut: Morphometrics[] = [];
  const conflicts: ConflictPair[] = [];

  let skippedRings = 0;

  // 包内 id → 主台账 id 的重映射
  const siteIdMap = new Map<string, string>();
  const sessionIdMap = new Map<string, string>();
  // 量度挂到「该事件最终采用版」上：冲突时也挂站里采用版，保证量度随鸟可见
  const morphRingIdMap = new Map<string, string>();

  const existingSiteIds = new Set(existing.sites.map((site) => site.id));
  const existingSessionIds = new Set(existing.sessions.map((session) => session.id));
  const existingRingIds = new Set(existing.rings.map((ring) => ring.id));
  const existingMorphIds = new Set(existing.morphs.map((morph) => morph.id));

  // ---- 鸟点：编号对齐；陌生点位挂「待确认」 ----
  for (const raw of pkg.sites as PkgSite[]) {
    if (!raw || !raw.siteNo) continue;
    const known = existing.sites.find((site) => norm(site.siteNo) === norm(raw.siteNo));
    if (known) {
      siteIdMap.set(raw.id, known.id);
      continue;
    }
    // 编号陌生：即使 id 撞号也重新分配，避免覆盖无关点位
    const newId = existingSiteIds.has(raw.id) ? uid('site') : raw.id;
    existingSiteIds.add(newId);
    const site: BirdSite = {
      ...raw,
      id: newId,
      siteNo: String(raw.siteNo).trim(),
      name: String(raw.name ?? raw.siteNo).trim(),
      lng: Number(raw.lng) || 0,
      lat: Number(raw.lat) || 0,
      netCount: Number(raw.netCount) || 0,
      ...stamp,
      status: 'pending',
    };
    sitesToPut.push(site);
    siteIdMap.set(raw.id, newId);
  }

  // ---- 批次：批次号对齐 ----
  for (const raw of pkg.sessions as PkgSession[]) {
    if (!raw || !raw.sessionNo) continue;
    const known = existing.sessions.find((session) => norm(session.sessionNo) === norm(raw.sessionNo));
    if (known) {
      sessionIdMap.set(raw.id, known.id);
      continue;
    }
    const newId = existingSessionIds.has(raw.id) ? uid('session') : raw.id;
    existingSessionIds.add(newId);
    const session: SurveySession = {
      ...raw,
      id: newId,
      sessionNo: String(raw.sessionNo).trim(),
      siteId: siteIdMap.get(raw.siteId) ?? raw.siteId,
      ...stamp,
    };
    sessionsToPut.push(session);
    sessionIdMap.set(raw.id, newId);
  }

  /** 把一条野外环志收编为冲突留版（默认站里版采用、野外版留档；站里已改采其他版本时沿用现状） */
  function keepBoth(station: RingRecord, raw: PkgRing): void {
    const groupId = station.conflictGroup || uid('conflict');
    // station.superseded === true 表示站里此前已采用该组的另一版，沿用现状，不抢回采用权
    if (station.conflictGroup !== groupId) {
      stationRingsToUpdate.push({ ...station, conflictGroup: groupId, superseded: false });
    }
    let fieldId = raw.id;
    if (!fieldId || existingRingIds.has(fieldId) || ringsToAdd.some((r) => r.id === fieldId) || fieldRingsToAdd.some((r) => r.id === fieldId)) {
      fieldId = uid('ring');
    }
    existingRingIds.add(fieldId);
    const field: RingRecord = {
      ...raw,
      id: fieldId,
      ringNo: String(raw.ringNo).trim(),
      colorRing: raw.colorRing || '无',
      netRound: Number(raw.netRound) || 1,
      siteId: siteIdMap.get(raw.siteId) ?? raw.siteId,
      sessionId: sessionIdMap.get(raw.sessionId) ?? raw.sessionId,
      ...stamp,
      conflictGroup: groupId,
      superseded: true,
    };
    fieldRingsToAdd.push(field);
    conflicts.push({ groupId, station, field });
    morphRingIdMap.set(raw.id, station.id);
  }

  // ---- 环志：id / 事件指纹对齐，内容比对 ----
  for (const raw of pkg.rings as PkgRing[]) {
    if (!raw || !raw.ringNo) continue;
    const incoming: RingRecord = {
      ...raw,
      ringNo: String(raw.ringNo).trim(),
      colorRing: raw.colorRing || '无',
      netRound: Number(raw.netRound) || 1,
      siteId: siteIdMap.get(raw.siteId) ?? raw.siteId,
      sessionId: sessionIdMap.get(raw.sessionId) ?? raw.sessionId,
    };

    const byId = incoming.id ? existing.rings.find((ring) => ring.id === incoming.id) : undefined;
    if (byId) {
      if (sameByFields(byId, incoming, RING_COMPARE_FIELDS)) {
        morphRingIdMap.set(raw.id, byId.id);
        skippedRings += 1;
      } else {
        keepBoth(byId, incoming);
      }
      continue;
    }

    // 同环号下，按事件指纹找采用版（重捕/回收是多条事件，不能只按环号）
    const byFingerprint = existing.rings.find(
      (ring) => !ring.superseded && ringFingerprint(ring) === ringFingerprint(incoming),
    );
    if (byFingerprint) {
      if (sameByFields(byFingerprint, incoming, RING_COMPARE_FIELDS)) {
        morphRingIdMap.set(raw.id, byFingerprint.id);
        skippedRings += 1;
      } else {
        keepBoth(byFingerprint, incoming);
      }
      continue;
    }

    // 新鸟或新的捕捉事件 → 直接收编为正式采用版
    let newId = incoming.id;
    if (!newId || existingRingIds.has(newId) || ringsToAdd.some((r) => r.id === newId)) {
      newId = uid('ring');
    }
    existingRingIds.add(newId);
    const added: RingRecord = {
      ...incoming,
      id: newId,
      ...stamp,
      conflictGroup: '',
      superseded: false,
    };
    ringsToAdd.push(added);
    morphRingIdMap.set(raw.id, newId);
  }

  // ---- 量度：挂到采用版环志；同事件同值去重，异值保留野外版 ----
  let skippedMorphs = 0;
  for (const raw of pkg.morphs as PkgMorph[]) {
    if (!raw) continue;
    const targetRingId = morphRingIdMap.get(raw.ringId);
    if (!targetRingId) {
      skippedMorphs += 1; // 环志没并进来（孤儿量度）
      continue;
    }
    const incoming: Morphometrics = {
      ...raw,
      ringId: targetRingId,
      ...stamp,
    };
    const sameEvent = existing.morphs.filter((morph) => morph.ringId === targetRingId);
    const identical = sameEvent.find(
      (morph) =>
        norm(morph.measuredAt) === norm(incoming.measuredAt) &&
        norm(morph.measuredBy) === norm(incoming.measuredBy) &&
        sameByFields(morph, incoming, MORPH_COMPARE_FIELDS),
    );
    if (identical) {
      skippedMorphs += 1;
      continue;
    }
    let newId = incoming.id;
    if (!newId || existingMorphIds.has(newId) || morphsToPut.some((m) => m.id === newId)) {
      newId = uid('morph');
    }
    existingMorphIds.add(newId);
    morphsToPut.push({ ...incoming, id: newId });
  }

  return {
    origin,
    exportedAt: String(pkg.exportedAt ?? ''),
    packageId: pkg.packageId,
    sitesToPut,
    sessionsToPut,
    ringsToAdd,
    stationRingsToUpdate,
    fieldRingsToAdd,
    conflicts,
    morphsToPut,
    skippedRings,
    skippedMorphs,
    newSiteCount: sitesToPut.length,
    pendingSiteCount: sitesToPut.length,
    newSessionCount: sessionsToPut.length,
  };
}
