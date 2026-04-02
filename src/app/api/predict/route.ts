/**
 * 房价预测 API
 * GET/POST /api/predict
 */

import { NextRequest } from 'next/server';
import { predictHousingPrice, predictHousingPriceV2 } from '@/lib/spider/predict';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { version = 'v1' } = body;

    if (version === 'v2') {
      const {
        unitMonthlyRent,
        area,
        capitalInterestRate = 0.016,
        depreciationRate = 0.01,
        riskRate = 0.005,
      } = body;

      if (!unitMonthlyRent || unitMonthlyRent <= 0) {
        return Response.json({ success: false, error: '单位面积月房租必须大于0' }, { status: 400 });
      }
      if (!area || area <= 0) {
        return Response.json({ success: false, error: '总面积必须大于0' }, { status: 400 });
      }

      const predictedPrice = predictHousingPriceV2(
        unitMonthlyRent,
        area,
        capitalInterestRate,
        depreciationRate,
        riskRate
      );

      const monthlyRent = unitMonthlyRent * area;
      const annualRent = monthlyRent * 12;
      const totalRate = capitalInterestRate + depreciationRate + riskRate;
      const priceToRentRatio = annualRent > 0 ? predictedPrice / annualRent : 0;

      return Response.json({
        success: true,
        version: 'v2',
        input: { unitMonthlyRent, area, capitalInterestRate, depreciationRate, riskRate },
        result: {
          predictedPrice,
          monthlyRent,
          annualRent,
          totalRate,
          priceToRentRatio,
        },
      });
    } else {
      // V1
      const {
        monthlyRent,
        capitalInterestRate = 0.016,
        depreciationRate = 0.01,
        riskRate = 0.005,
      } = body;

      if (!monthlyRent || monthlyRent <= 0) {
        return Response.json({ success: false, error: '月租金必须大于0' }, { status: 400 });
      }

      const predictedPrice = predictHousingPrice(
        monthlyRent,
        capitalInterestRate,
        depreciationRate,
        riskRate
      );

      const annualRent = monthlyRent * 12;
      const totalRate = capitalInterestRate + depreciationRate + riskRate;
      const priceToRentRatio = annualRent > 0 ? predictedPrice / annualRent : 0;

      return Response.json({
        success: true,
        version: 'v1',
        input: { monthlyRent, capitalInterestRate, depreciationRate, riskRate },
        result: {
          predictedPrice,
          annualRent,
          totalRate,
          priceToRentRatio,
        },
      });
    }
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
