import Dexie, { type Table } from 'dexie';
import type { RingRecord } from '../types/ring-record';
import type { Morphometrics } from '../types/morphometrics';
import type { BirdSite } from '../types/bird-site';
import type { SurveySession } from '../types/session';
import type { MergeLog } from '../types/source';

/** IndexedDB 库名（浏览器本地存储，无后端） */
export const DB_NAME = 'gbbirdring-db';

/** 当前 schema 版本，与 db.version(n) 对应 */
export const SCHEMA_VERSION = 3;

class BirdRingDB extends Dexie {
  rings!: Table<RingRecord, string>;
  morphs!: Table<Morphometrics, string>;
  sites!: Table<BirdSite, string>;
  sessions!: Table<SurveySession, string>;
  /** 合并日志：按摘录包 id 去重，保证同一包不重复并两次 */
  mergeLogs!: Table<MergeLog, string>;
  meta!: Table<{ key: string; value: string }, string>;

  constructor() {
    super(DB_NAME);

    // v1：建表声明索引
    this.version(1).stores({
      rings: 'id, ringNo, speciesCn, status, ringDate, siteId, sessionId',
      morphs: 'id, ringId, measuredAt',
      sites: 'id, siteNo, habitat, name',
      sessions: 'id, sessionNo, date, siteId, closed',
      meta: 'key',
    });

    // v2：环志表增加 (speciesCn+ringDate) 复合索引，鸟种按日期检索更快；并回填历史彩环字段。
    // 升级前请在顶栏「导出备份」导出 JSON。
    this.version(2)
      .stores({
        rings: 'id, ringNo, speciesCn, status, ringDate, siteId, sessionId, [speciesCn+ringDate]',
        morphs: 'id, ringId, measuredAt',
        sites: 'id, siteNo, habitat, name',
        sessions: 'id, sessionNo, date, siteId, closed',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        await tx
          .table('rings')
          .toCollection()
          .modify((row: RingRecord) => {
            if (typeof row.colorRing !== 'string') {
              row.colorRing = '无';
            }
          });
      });

    // v3：离线摘录包合并。
    // - 四张表统一补 source / origin 来源标记（已有老数据没有标记，统一回填为「站里」）；
    // - rings 增加 conflictGroup / superseded（同环号两边都改过时留两版、按采用版统计）；
    // - sites 增加 status（合并来的陌生点位先「待确认」，不进正式统计）；
    // - 新增 mergeLogs 表，按 packageId 幂等，已并进去的包重试时不重复记账。
    this.version(3)
      .stores({
        rings:
          'id, ringNo, speciesCn, status, ringDate, siteId, sessionId, [speciesCn+ringDate], source, conflictGroup, superseded',
        morphs: 'id, ringId, measuredAt, source',
        sites: 'id, siteNo, habitat, name, source, status',
        sessions: 'id, sessionNo, date, siteId, closed, source',
        mergeLogs: 'packageId, mergedAt',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        const backfill = (row: { source?: string; origin?: string; status?: string }) => {
          if (row.source !== 'station' && row.source !== 'field') {
            row.source = 'station';
          }
          if (typeof row.origin !== 'string' || !row.origin) {
            row.origin = '站里';
          }
        };
        await Promise.all([
          tx
            .table('rings')
            .toCollection()
            .modify((row: RingRecord) => {
              backfill(row);
              if (!row.conflictGroup) row.conflictGroup = '';
              if (typeof row.superseded !== 'boolean') row.superseded = false;
            }),
          tx
            .table('morphs')
            .toCollection()
            .modify((row: Morphometrics) => backfill(row)),
          tx
            .table('sites')
            .toCollection()
            .modify((row: BirdSite) => {
              backfill(row);
              if (row.status !== 'confirmed' && row.status !== 'pending') {
                // 台账既有点位视为正式点位
                row.status = 'confirmed';
              }
            }),
          tx
            .table('sessions')
            .toCollection()
            .modify((row: SurveySession) => backfill(row)),
        ]);
      });
  }
}

export const db = new BirdRingDB();

export async function getMeta(key: string): Promise<string | undefined> {
  const row = await db.meta.get(key);
  return row?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}
