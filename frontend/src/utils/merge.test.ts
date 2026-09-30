import 'fake-indexeddb/auto';
import { db } from './db';
import { importExcerpt, buildExcerpt, resolveConflict, confirmSite } from './merge';
import type { ExcerptPackage } from './merge';
import type { RingRecord } from '../types/ring-record';
import type { BirdSite } from '../types/bird-site';
import type { SurveySession } from '../types/session';
import type { Morphometrics } from '../types/morphometrics';

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    console.error(`  ✗ ${msg}`);
  }
}

const site: BirdSite = {
  id: 'site-001', siteNo: 'S-01', name: '大汶流芦苇荡', lng: 118.05, lat: 38.92,
  habitat: '芦苇湿地', netCount: 12, source: 'local', pending: false, conflictStatus: 'active',
};
const session: SurveySession = {
  id: 'session-001', sessionNo: '2024-A01', date: '2024-09-01', siteId: 'site-001',
  startedAt: '05:00', endedAt: '11:00', netRounds: 6, cloudCover: 2, windForce: 2,
  closed: true, leader: '韩雪', source: 'local', conflictStatus: 'active',
};
const ringLocal: RingRecord = {
  id: 'ring-001', ringNo: 'A-10001', colorRing: '无', speciesCn: '红喉歌鸲', speciesSci: 'Calliope calliope',
  age: '成', ringDate: '2024-09-01T08:00:00.000Z', netNo: '3 号网', netRound: 2, status: '初捕',
  ringer: '韩雪', siteId: 'site-001', sessionId: 'session-001', source: 'local', conflictStatus: 'active',
};
const morphLocal: Morphometrics = {
  id: 'morph-001', ringId: 'ring-001', billLength: 14.2, billWidth: 4.1, wingLength: 74.5,
  tailLength: 58.2, tarsusLength: 23.4, weight: 23.6, fatScore: 2, measuredBy: '韩雪',
  measuredAt: '2024-09-01T09:00:00.000Z', source: 'local',
};

async function setup() {
  await Promise.all([
    db.rings.clear(),
    db.morphs.clear(),
    db.sites.clear(),
    db.sessions.clear(),
    db.meta.clear(),
  ]);
  await db.sites.put(site);
  await db.sessions.put(session);
  await db.rings.put(ringLocal);
  await db.morphs.put(morphLocal);
}

/** 野外端摘录包：同鸟冲突 + 新鸟 + 新鸟点(待确认) + 相同鸟点(跳过) + 新量度 */
function makeExcerpt(): ExcerptPackage {
  const ringConflict: RingRecord = {
    ...ringLocal,
    id: 'ring-field-001',
    speciesCn: '红胁蓝尾鸲', // 两边都改过：鸟种不同
    speciesSci: 'Tarsiger cyanurus',
    source: 'local',
    conflictStatus: 'active',
  };
  const ringNew: RingRecord = {
    id: 'ring-field-002', ringNo: 'A-10002', colorRing: '无', speciesCn: '黄眉柳莺', speciesSci: 'Phylloscopus inornatus',
    age: '幼', ringDate: '2024-09-10T08:00:00.000Z', netNo: '1 号网', netRound: 1, status: '初捕',
    ringer: '郑海', siteId: 'site-field-099', sessionId: 'session-field-002', source: 'local', conflictStatus: 'active',
  };
  const siteNew: BirdSite = {
    id: 'site-field-099', siteNo: 'S-99', name: '野外新点', lng: 118.1, lat: 38.9,
    habitat: '滩涂', netCount: 6, source: 'local', pending: false, conflictStatus: 'active',
  };
  const sessionNew: SurveySession = {
    id: 'session-field-002', sessionNo: '2024-A09', date: '2024-09-10', siteId: 'site-field-099',
    startedAt: '06:00', endedAt: '10:00', netRounds: 4, cloudCover: 3, windForce: 1,
    closed: false, leader: '郑海', source: 'local', conflictStatus: 'active',
  };
  const morphNew: Morphometrics = {
    id: 'morph-field-002', ringId: 'ring-field-002', billLength: 9.6, billWidth: 3.2, wingLength: 58.4,
    tailLength: 38.6, tarsusLength: 16.8, weight: 7.4, fatScore: 1, measuredBy: '郑海',
    measuredAt: '2024-09-10T09:00:00.000Z', source: 'local',
  };
  return {
    app: 'gbbirdring-excerpt',
    formatVersion: 1,
    packageId: 'excerpt-test-001',
    device: '野外小组A',
    exportedAt: '2024-09-10T12:00:00.000Z',
    rings: [ringConflict, ringNew],
    morphs: [morphNew],
    sites: [siteNew, { ...site, id: 'site-field-001', source: 'local' }],
    sessions: [sessionNew],
  };
}

async function testMergeAndIdempotent() {
  await setup();
  const pkg = makeExcerpt();
  const result = await importExcerpt(JSON.stringify(pkg));

  assert(result.counts.rings.added === 1, `环志新增 1（实际 ${result.counts.rings.added}）`);
  assert(result.counts.rings.conflicts === 1, `环志冲突 1（实际 ${result.counts.rings.conflicts}）`);
  assert(result.counts.rings.skipped === 0, `环志跳过 0（实际 ${result.counts.rings.skipped}）`);
  assert(result.counts.sites.pending === 1, `鸟点待确认 1（实际 ${result.counts.sites.pending}）`);
  assert(result.counts.sites.skipped === 1, `鸟点跳过 1（实际 ${result.counts.sites.skipped}）`);
  assert(result.counts.sessions.added === 1, `批次新增 1（实际 ${result.counts.sessions.added}）`);
  assert(result.counts.morphs.added === 1, `量度新增 1（实际 ${result.counts.morphs.added}）`);
  assert(result.newConflictGroups.length === 1, `新冲突组 1（实际 ${result.newConflictGroups.length}）`);

  // 校验落库结果
  const rings = await db.rings.toArray();
  assert(rings.length === 3, `合并后环志共 3 条（实际 ${rings.length}）`);
  const a10001 = rings.filter((r) => r.ringNo === 'A-10001');
  assert(a10001.length === 2, `A-10001 两版（实际 ${a10001.length}）`);
  const localVer = a10001.find((r) => r.source === 'local')!;
  const mergeVer = a10001.find((r) => r.source === 'merge')!;
  assert(localVer.conflictStatus === 'active', '本站版有效');
  assert(mergeVer.conflictStatus === 'pending', '野外版待裁决');
  assert(localVer.conflictGroup === mergeVer.conflictGroup, '两版同冲突组');
  assert(mergeVer.speciesCn === '红胁蓝尾鸲', '野外版鸟种为合并值');

  const a10002 = rings.find((r) => r.ringNo === 'A-10002')!;
  assert(a10002.source === 'merge' && a10002.conflictStatus === 'active', 'A-10002 合并且有效');
  assert(a10002.siteId !== 'site-field-099', 'A-10002 鸟点 id 已重映射');

  const sites = await db.sites.toArray();
  const s99 = sites.find((s) => s.siteNo === 'S-99')!;
  assert(s99.pending === true && s99.source === 'merge', 'S-99 待确认且来源 merge');
  assert(sites.filter((s) => s.siteNo === 'S-01').length === 1, 'S-01 未重复');

  const morphs = await db.morphs.toArray();
  assert(morphs.length === 2, `量度共 2 条（实际 ${morphs.length}）`);
  const morphNew = morphs.find((m) => m.measuredBy === '郑海')!;
  assert(morphNew.ringId === a10002.id, '量度 ringId 已重映射到新环志');

  // 幂等：重复导入同一个包，全部跳过，不重复计数
  const result2 = await importExcerpt(JSON.stringify(pkg));
  assert(result2.counts.rings.added === 0 && result2.counts.rings.conflicts === 0, '重复导入环志不新增/冲突');
  assert(result2.counts.rings.skipped === 2, `重复导入环志跳过 2（实际 ${result2.counts.rings.skipped}）`);
  assert(result2.counts.sites.skipped === 2, `重复导入鸟点跳过 2（实际 ${result2.counts.sites.skipped}）`);
  assert(result2.counts.morphs.skipped === 1, `重复导入量度跳过 1（实际 ${result2.counts.morphs.skipped}）`);
  const rings2 = await db.rings.toArray();
  assert(rings2.length === 3, `重复导入后环志仍 3 条（实际 ${rings2.length}）`);
  const sites2 = await db.sites.toArray();
  assert(sites2.length === 2, `重复导入后鸟点仍 2 个（实际 ${sites2.length}）`);

  console.log(`testMergeAndIdempotent: ${pass} passed, ${fail} failed`);
}

async function testResolveAndConfirm() {
  await setup();
  const pkg = makeExcerpt();
  const result = await importExcerpt(JSON.stringify(pkg));
  const groupId = result.newConflictGroups[0];

  // 采用野外版
  const rings = await db.rings.toArray();
  const mergeVer = rings.find((r) => r.ringNo === 'A-10001' && r.source === 'merge')!;
  await resolveConflict(groupId, mergeVer.id);
  const after = await db.rings.toArray();
  const localVer = after.find((r) => r.ringNo === 'A-10001' && r.source === 'local')!;
  const mergeVer2 = after.find((r) => r.ringNo === 'A-10001' && r.source === 'merge')!;
  assert(mergeVer2.conflictStatus === 'active', '采用后野外版有效');
  assert(localVer.conflictStatus === 'superseded', '采用后本站版废弃');

  // 确认待确认鸟点
  const sites = await db.sites.toArray();
  const s99 = sites.find((s) => s.siteNo === 'S-99')!;
  await confirmSite(s99.id);
  const s99After = await db.sites.get(s99.id);
  assert(s99After!.pending === false, 'S-99 已确认');

  console.log(`testResolveAndConfirm: ${pass} passed, ${fail} failed`);
}

async function testBuildExcerpt() {
  await setup();
  const pkg = await buildExcerpt('本站');
  assert(pkg.app === 'gbbirdring-excerpt', '摘录包标记正确');
  assert(pkg.rings.length === 1 && pkg.rings[0].source === 'local', '摘录包只含本站记录');
  assert(pkg.sites.length === 1, '摘录包含 1 个鸟点');
  console.log(`testBuildExcerpt: ${pass} passed, ${fail} failed`);
}

async function testRetryAfterFailure() {
  await setup();
  const before = await db.rings.count();
  // 坏包：解析失败，不应写入任何数据
  let threw = false;
  try {
    await importExcerpt(JSON.stringify({ app: 'not-an-excerpt', rings: [], morphs: [], sites: [], sessions: [] }));
  } catch {
    threw = true;
  }
  assert(threw, '坏包导入抛错');
  const afterFail = await db.rings.count();
  assert(afterFail === before, `失败后无部分写入（${before} -> ${afterFail}）`);

  // 重试：正常包成功并入
  const pkg = makeExcerpt();
  const result = await importExcerpt(JSON.stringify(pkg));
  assert(result.counts.rings.added === 1, '重试成功并入新环志');
  const afterRetry = await db.rings.count();
  assert(afterRetry === before + 2, `重试后环志数正确（${before} -> ${afterRetry}）`);
  console.log(`testRetryAfterFailure: ${pass} passed, ${fail} failed`);
}

async function main() {
  await testMergeAndIdempotent();
  await testResolveAndConfirm();
  await testBuildExcerpt();
  await testRetryAfterFailure();
  if (fail > 0) {
    console.error(`\n${fail} assertions failed`);
    process.exit(1);
  }
  console.log('\nAll tests passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
