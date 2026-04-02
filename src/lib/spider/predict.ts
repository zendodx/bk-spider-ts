/**
 * 房价预测工具
 * 对应原 Python 项目 tools/total_price_predict.py
 */

/**
 * 房价预测 V1
 * 房价 = 年租金 / (资金利息 + 折旧率 + 风险赔率)
 */
export function predictHousingPrice(
  monthlyRent: number,
  capitalInterestRate = 0.016,
  depreciationRate = 0.01,
  riskRate = 0.005
): number {
  const annualRent = monthlyRent * 12;
  const totalRate = capitalInterestRate + depreciationRate + riskRate;
  return annualRent / totalRate;
}

/**
 * 房价预测 V2
 * 房价 = (单位面积月房租 × 总面积 × 12) / (资金利息 + 折旧率 + 风险赔率)
 */
export function predictHousingPriceV2(
  unitMonthlyRent: number,
  area: number,
  capitalInterestRate = 0.016,
  depreciationRate = 0.01,
  riskRate = 0.005
): number {
  const annualRent = unitMonthlyRent * area * 12;
  const totalRate = capitalInterestRate + depreciationRate + riskRate;
  return annualRent / totalRate;
}
