import { db } from './db';
import { uid } from './id';
import { planMerge, type MergePlan } from './merge-core';
import { toPlain, toPlainList } from './plain';
import type { MergeLog, ExtractPackage } from '../types/source';
import type { RingRecord } from '../types/ring-record';

export interface MergeResult {
  log: MergeLog;
  conflicts: MergePlan['conflicts'];
  /** 同一摘录包此前已合并过（幂等拦截，不重复记账） */
  duplicate: boolean;
}

function validatePackage(payload: unknown): ExtractPackage {
  if (!payload || typeof payload !== 'object') {
    throw new Error('摘录包内容为空或不是合法 JSON');
  }
  const pkg = payload as Partial<ExtractPackage>;
  if (pkg.app !== 'gbbirdring-extract') {
    throw new Error('不是 gbbirdring 摘录包（缺少 app=gbbirdring-extract 标记）');
  }
  if (!pkg.packageId) {
    throw new Error('摘录包缺少 packageId，无法保证幂等');
  }
  return pkg as ExtractPackage;
}

/**
 * 把野外摘录包合并进主台账（单事务，失败整体回滚，可安全重试）。
 * 同一 packageId 已合并过时直接返回既有日志，不会重复写任何记录。
 */
export async function importExtractPackage(text: string): Promise<MergeResult> {
  const pkg = validatePackage(JSON.parse(text));

  const existedLog = await db.mergeLogs.get(pkg.packageId);
  if (existedLog) {
    // 已并进去的包不能重复记两次：直接回显既有合并结果
    return { log: existedLog, conflicts: [], duplicate: true };
  }

  const [rings, morphs, sites, sessions] = await Promise.all([
    db.rings.toArray(),
    db.morphs.toArray(),
    db.sites.toArray(),
    db.sessions.toArray(),
  ]);

  const now = new Date().toISOString();
  const plan = planMerge({ rings, morphs, sites, sessions }, pkg, now);

  const allAddedRingIds = [...plan.ringsToAdd.map((r) => r.id), ...plan.fieldRingsToAdd.map((r) => r.id)];
  const log: MergeLog = {
    packageId: pkg.packageId,
    origin: plan.origin,
    exportedAt: plan.exportedAt,
    mergedAt: now,
    ringsAdded: plan.ringsToAdd.length,
    conflicts: plan.conflicts.length,
    sitesAdded: plan.newSiteCount,
    sitesPending: plan.pendingSiteCount,
    sessionsAdded: plan.newSessionCount,
    ringIds: allAddedRingIds,
  };

  // 整包一个事务：任一写入失败则整体回滚（未写入 mergeLogs，重试不会撞幂等键）
  await db.transaction(
    'rw',
    db.sites,
    db.sessions,
    db.rings,
    db.morphs,
    db.mergeLogs,
    async () => {
      if (plan.sitesToPut.length) await db.sites.bulkPut(toPlainList(plan.sitesToPut));
      if (plan.sessionsToPut.length) await db.sessions.bulkPut(toPlainList(plan.sessionsToPut));
      if (plan.stationRingsToUpdate.length) await db.rings.bulkPut(toPlainList(plan.stationRingsToUpdate));
      if (plan.ringsToAdd.length) await db.rings.bulkPut(toPlainList(plan.ringsToAdd));
      if (plan.fieldRingsToAdd.length) await db.rings.bulkPut(toPlainList(plan.fieldRingsToAdd));
      if (plan.morphsToPut.length) await db.morphs.bulkPut(toPlainList(plan.morphsToPut));
      await db.mergeLogs.put(toPlain(log) as MergeLog);
    },
  );

  return { log, conflicts: plan.conflicts, duplicate: false };
}

/**
 * 站里给冲突记录定版：采用指定版本，同组其余版本留档（superseded，不进统计/导出）。
 */
export async function adoptRingVersion(groupId: string, adoptId: string): Promise<void> {
  await db.transaction('rw', db.rings, async () => {
    const group = await db.rings.where('conflictGroup').equals(groupId).toArray();
    for (const ring of group) {
      const next: RingRecord = { ...ring, superseded: ring.id !== adoptId };
      await db.rings.put(next);
    }
  });
}

/** 确认合并来的待确认鸟点：转为正式点位，挂在该点的环志随后进入正式统计 */
export async function confirmSite(siteId: string): Promise<void> {
  const site = await db.sites.get(siteId);
  if (!site) return;
  await db.sites.put({ ...site, status: 'confirmed' });
}

/** 把待确认鸟点退回（保留点位但不进统计），便于误确认时撤销 */
export async function unconfirmSite(siteId: string): Promise<void> {
  const site = await db.sites.get(siteId);
  if (!site) return;
  await db.sites.put({ ...site, status: 'pending' });
}

export async function listMergeLogs(): Promise<MergeLog[]> {
  return db.mergeLogs.orderBy('mergedAt').reverse().toArray();
}

/**
 * 生成一份野外离线摘录包（供野外小组登记后导出、回站合并）。
 * 仅打包当前设备上录入的、非留档的记录；站点/批次按其引用范围带上。
 */
export async function buildExtractPackage(origin: string): Promise<ExtractPackage> {
  const [rings, morphs, sites, sessions] = await Promise.all([
    db.rings.filter((ring) => !ring.superseded).toArray(),
    db.morphs.toArray(),
    db.sites.toArray(),
    db.sessions.toArray(),
  ]);
  const ringIds = new Set(rings.map((ring) => ring.id));
  const siteIds = new Set(rings.map((ring) => ring.siteId));
  const sessionIds = new Set(rings.map((ring) => ring.sessionId));
  return {
    app: 'gbbirdring-extract',
    packageId: uid('pkg'),
    origin: origin.trim() || '野外小组',
    exportedAt: new Date().toISOString(),
    rings,
    morphs: morphs.filter((morph) => ringIds.has(morph.ringId)),
    sites: sites.filter((site) => siteIds.has(site.id)),
    sessions: sessions.filter((session) => sessionIds.has(session.id)),
  };
}
