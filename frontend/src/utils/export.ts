import { db, SCHEMA_VERSION } from './db';
import type { RingRecord } from '../types/ring-record';
import type { BirdSite } from '../types/bird-site';

export interface BackupPayload {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  rings: unknown[];
  morphs: unknown[];
  sites: unknown[];
  sessions: unknown[];
  mergeLogs: unknown[];
}

/** 汇总全部本地表为 JSON 备份（schema 迁移前先导出） */
export async function buildBackup(): Promise<BackupPayload> {
  const [rings, morphs, sites, sessions, mergeLogs] = await Promise.all([
    db.rings.toArray(),
    db.morphs.toArray(),
    db.sites.toArray(),
    db.sessions.toArray(),
    db.mergeLogs.toArray(),
  ]);
  return {
    app: 'gbbirdring',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    rings,
    morphs,
    sites,
    sessions,
    mergeLogs,
  };
}

export async function exportBackupJson(): Promise<string> {
  return JSON.stringify(await buildBackup(), null, 2);
}

export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 导出 CSV（环志汇总表打印用） */
export function downloadCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns: Array<{ key: keyof T; title: string }>,
): void {
  const header = columns.map((c) => `"${c.title}"`).join(',');
  const body = rows
    .map((row) => columns.map((c) => `"${String(row[c.key] ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  downloadText(filename, `\ufeff${header}\n${body}`, 'text/csv');
}

/** 恢复 JSON 备份 */
export async function importBackup(text: string): Promise<{ rings: number; morphs: number; sites: number; sessions: number }> {
  const payload = JSON.parse(text) as Partial<BackupPayload>;
  if (!payload || payload.app !== 'gbbirdring') {
    throw new Error('备份文件格式不匹配（缺少 app=gbbirdring 标记）');
  }
  const counts = {
    rings: payload.rings?.length ?? 0,
    morphs: payload.morphs?.length ?? 0,
    sites: payload.sites?.length ?? 0,
    sessions: payload.sessions?.length ?? 0,
  };
  await db.transaction('rw', db.rings, db.morphs, db.sites, db.sessions, db.mergeLogs, async () => {
    await Promise.all([db.rings.clear(), db.morphs.clear(), db.sites.clear(), db.sessions.clear(), db.mergeLogs.clear()]);
    if (payload.rings?.length) await db.rings.bulkPut(payload.rings as never[]);
    if (payload.morphs?.length) await db.morphs.bulkPut(payload.morphs as never[]);
    if (payload.sites?.length) await db.sites.bulkPut(payload.sites as never[]);
    if (payload.sessions?.length) await db.sessions.bulkPut(payload.sessions as never[]);
    if (payload.mergeLogs?.length) await db.mergeLogs.bulkPut(payload.mergeLogs as never[]);
  });
  return counts;
}

/**
 * 导出表行：合并后的正式环志记录（采用版 + 已确认鸟点），附来源标记。
 * 统计台与环志记录的导出统一走这里，保证与正式统计口径一致。
 */
export function ringExportRows(
  rings: RingRecord[],
  sites: BirdSite[],
): Array<Record<string, unknown>> {
  const siteNameOf = (siteId: string) => sites.find((site) => site.id === siteId)?.name ?? '未知鸟点';
  return rings.map((ring) => ({
    ringNo: ring.ringNo,
    colorRing: ring.colorRing,
    speciesCn: ring.speciesCn,
    speciesSci: ring.speciesSci,
    age: ring.age,
    ringDate: ring.ringDate,
    netNo: ring.netNo,
    netRound: ring.netRound,
    status: ring.status,
    ringer: ring.ringer,
    site: siteNameOf(ring.siteId),
    source: ring.source === 'field' ? `野外·${ring.origin}` : '站里',
    remark: ring.remark ?? '',
  }));
}

export const RING_EXPORT_COLUMNS: Array<{ key: string; title: string }> = [
  { key: 'ringNo', title: '金属环号' },
  { key: 'colorRing', title: '彩环' },
  { key: 'speciesCn', title: '鸟种' },
  { key: 'speciesSci', title: '学名' },
  { key: 'age', title: '年龄' },
  { key: 'ringDate', title: '环志日期' },
  { key: 'netNo', title: '网号' },
  { key: 'netRound', title: '网次' },
  { key: 'status', title: '状态' },
  { key: 'ringer', title: '环志人' },
  { key: 'site', title: '鸟点' },
  { key: 'source', title: '来源' },
  { key: 'remark', title: '备注' },
];
