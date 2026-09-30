/** 量度项目键 */
export type MeasureKey =
  | 'billLength'
  | 'billWidth'
  | 'wingLength'
  | 'tailLength'
  | 'tarsusLength'
  | 'weight';

/** 量度测量记录 */
export interface Morphometrics {
  id: string;
  /** 关联环志记录 */
  ringId: string;
  /** 喙长（mm） */
  billLength: number;
  /** 喙宽（mm） */
  billWidth: number;
  /** 翅长（自然弦长，mm） */
  wingLength: number;
  /** 尾长（mm） */
  tailLength: number;
  /** 跗跖长（mm） */
  tarsusLength: number;
  /** 体重（g） */
  weight: number;
  /** 肥满度 0~4 */
  fatScore: number;
  /** 测量人 */
  measuredBy: string;
  /** 测量时间 ISO */
  measuredAt: string;
}

/** 量度字段定义（单位与常见范围），供 MeasureInput 与偏离提示使用 */
export interface MeasureField {
  key: MeasureKey;
  label: string;
  unit: string;
  /** 通用常见范围 */
  min: number;
  max: number;
  step: number;
}

export const MEASURE_FIELDS: MeasureField[] = [
  { key: 'billLength', label: '喙长', unit: 'mm', min: 5, max: 320, step: 0.1 },
  { key: 'billWidth', label: '喙宽', unit: 'mm', min: 2, max: 40, step: 0.1 },
  { key: 'wingLength', label: '翅长', unit: 'mm', min: 40, max: 700, step: 0.5 },
  { key: 'tailLength', label: '尾长', unit: 'mm', min: 20, max: 400, step: 0.5 },
  { key: 'tarsusLength', label: '跗跖长', unit: 'mm', min: 8, max: 200, step: 0.1 },
  { key: 'weight', label: '体重', unit: 'g', min: 3, max: 6000, step: 0.1 },
];

/** 单字段偏离结果 */
export interface MeasureDeviation {
  key: MeasureKey;
  label: string;
  value: number;
  /** 同鸟种历史均值（无历史时为 0） */
  mean: number;
  /** 偏离百分比 */
  deviationPct: number;
  level: '正常' | '偏离' | '超出常见区间';
  message: string;
}
