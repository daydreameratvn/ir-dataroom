import { useState } from 'react';
import { Card, CardHeader, CardContent, cn } from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import type { FWAHotspotProvince, FWAHotspotEntry } from '../types';
import { formatTHBShort } from '../utils/format';

interface FWAHotspotMapProps {
  byProvince: FWAHotspotProvince[];
  byCity: FWAHotspotEntry[];
  byProvider: FWAHotspotEntry[];
  byBroker: FWAHotspotEntry[];
}

// Thailand outline SVG path (simplified)
const THAILAND_PATH =
  'M160,20 L175,25 L185,40 L195,55 L200,75 L205,90 L195,105 L200,120 L210,130 ' +
  'L220,125 L230,130 L235,145 L225,155 L220,170 L225,185 L220,200 L210,210 ' +
  'L200,220 L195,235 L185,245 L175,255 L165,260 L155,270 L150,285 L145,300 ' +
  'L140,315 L135,330 L125,340 L115,350 L110,365 L105,380 L100,395 L95,410 ' +
  'L90,420 L85,410 L80,395 L75,380 L80,365 L85,350 L80,335 L75,320 ' +
  'L70,305 L65,290 L70,275 L75,260 L80,245 L85,230 L90,215 L85,200 ' +
  'L80,185 L75,170 L80,155 L85,140 L90,125 L95,110 L100,95 L105,80 ' +
  'L110,65 L120,50 L130,40 L140,30 L150,25 Z';

// Province approximate positions on the SVG viewport (320x440)
const PROVINCE_POSITIONS: Record<string, { x: number; y: number }> = {
  'Bangkok': { x: 145, y: 235 },
  'Chiang Mai': { x: 105, y: 70 },
  'Chiang Rai': { x: 125, y: 40 },
  'Nonthaburi': { x: 140, y: 228 },
  'Pathum Thani': { x: 150, y: 220 },
  'Samut Prakan': { x: 155, y: 245 },
  'Nakhon Ratchasima': { x: 190, y: 200 },
  'Khon Kaen': { x: 195, y: 155 },
  'Udon Thani': { x: 185, y: 120 },
  'Chon Buri': { x: 170, y: 255 },
  'Phuket': { x: 95, y: 395 },
  'Surat Thani': { x: 110, y: 345 },
  'Songkhla': { x: 120, y: 410 },
  'Nakhon Si Thammarat': { x: 115, y: 375 },
  'Rayong': { x: 180, y: 260 },
  'Prachinburi': { x: 185, y: 235 },
  'Ubon Ratchathani': { x: 225, y: 185 },
  'Nakhon Pathom': { x: 130, y: 240 },
  'Ayutthaya': { x: 145, y: 210 },
  'Lampang': { x: 110, y: 95 },
  'Phitsanulok': { x: 130, y: 140 },
  'Nakhon Sawan': { x: 130, y: 165 },
  'Saraburi': { x: 155, y: 205 },
  'Loei': { x: 165, y: 115 },
  'Krabi': { x: 100, y: 380 },
};

function getCircleColor(detectionRate: number): string {
  if (detectionRate >= 30) return '#ef4444';
  if (detectionRate >= 20) return '#f97316';
  if (detectionRate >= 10) return '#f59e0b';
  return '#3b82f6';
}

function getCircleRadius(claims: number, maxClaims: number): number {
  const minR = 4;
  const maxR = 16;
  if (maxClaims === 0) return minR;
  return minR + ((claims / maxClaims) * (maxR - minR));
}

type HotspotTab = 'provinces' | 'cities' | 'providers' | 'brokers';

function HotspotTable({ data, label }: { data: FWAHotspotEntry[]; label: string }) {
  const { t } = useTranslation();
  if (data.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">{t('portal.fwaAnalytics.noData', { label })}</p>;
  }
  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead>
          <tr>
            <th className="border-b bg-muted/50 px-3 py-2 text-left text-xs font-medium">{label}</th>
            <th className="border-b bg-muted/50 px-3 py-2 text-right text-xs font-medium">{t('portal.fwaAnalytics.flagged')}</th>
            <th className="border-b bg-muted/50 px-3 py-2 text-right text-xs font-medium">{t('portal.fwaAnalytics.rate')}</th>
            <th className="border-b bg-muted/50 px-3 py-2 text-right text-xs font-medium">{t('portal.fwaAnalytics.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 10).map((item) => (
            <tr key={item.name} className="border-b last:border-0">
              <td className="px-3 py-2 text-xs">{item.name}</td>
              <td className="px-3 py-2 text-right text-xs font-mono">{item.flaggedClaims}/{item.totalClaims}</td>
              <td className="px-3 py-2 text-right text-xs font-mono">{item.detectionRate.toFixed(1)}%</td>
              <td className="px-3 py-2 text-right text-xs font-mono">{formatTHBShort(item.flaggedAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FWAHotspotMap({ byProvince, byCity, byProvider, byBroker }: FWAHotspotMapProps) {
  const { t } = useTranslation();
  const [hoveredProvince, setHoveredProvince] = useState<FWAHotspotProvince | null>(null);
  const [activeTab, setActiveTab] = useState<HotspotTab>('provinces');

  const maxClaims = Math.max(...byProvince.map((p) => p.flaggedClaims), 1);

  const tabs: { id: HotspotTab; label: string }[] = [
    { id: 'provinces', label: t('portal.fwaAnalytics.provinces') },
    { id: 'cities', label: t('portal.fwaAnalytics.cities') },
    { id: 'providers', label: t('portal.fwaAnalytics.providers') },
    { id: 'brokers', label: t('portal.fwaAnalytics.brokers') },
  ];

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <h3 className="text-sm font-semibold">{t('portal.fwaAnalytics.geographicHotspot')}</h3>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Map */}
          <div className="relative">
            <svg viewBox="0 0 320 440" className="mx-auto h-[400px] w-auto">
              {/* Thailand outline */}
              <path
                d={THAILAND_PATH}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-border"
                opacity={0.5}
              />

              {/* Province hotspots */}
              {byProvince.map((province) => {
                const pos = PROVINCE_POSITIONS[province.name];
                if (!pos) return null;
                const radius = getCircleRadius(province.flaggedClaims, maxClaims);
                const color = getCircleColor(province.detectionRate);
                return (
                  <g
                    key={province.name}
                    onMouseEnter={() => setHoveredProvince(province)}
                    onMouseLeave={() => setHoveredProvince(null)}
                    className="cursor-pointer"
                  >
                    <circle cx={pos.x} cy={pos.y} r={radius + 3} fill={color} opacity={0.15} />
                    <circle cx={pos.x} cy={pos.y} r={radius} fill={color} opacity={0.7} />
                  </g>
                );
              })}
            </svg>

            {/* Tooltip */}
            {hoveredProvince && (
              <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg border bg-popover px-4 py-3 shadow-lg">
                <p className="text-sm font-semibold">{hoveredProvince.name}</p>
                {hoveredProvince.nameTh && (
                  <p className="text-xs text-muted-foreground">{hoveredProvince.nameTh}</p>
                )}
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">{t('portal.fwaAnalytics.totalClaims')}</span>
                  <span className="text-right font-mono">{hoveredProvince.totalClaims}</span>
                  <span className="text-muted-foreground">{t('portal.fwaAnalytics.flagged')}</span>
                  <span className="text-right font-mono">{hoveredProvince.flaggedClaims}</span>
                  <span className="text-muted-foreground">{t('portal.fwaAnalytics.detectionRate')}</span>
                  <span className="text-right font-mono">{hoveredProvince.detectionRate.toFixed(1)}%</span>
                  <span className="text-muted-foreground">{t('portal.fwaAnalytics.avgScore')}</span>
                  <span className="text-right font-mono">{hoveredProvince.avgRiskScore.toFixed(1)}</span>
                  <span className="text-muted-foreground">{t('portal.fwaAnalytics.flaggedAmount')}</span>
                  <span className="text-right font-mono">{formatTHBShort(hoveredProvince.flaggedAmount)}</span>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                <span>&lt;10%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span>10-20%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                <span>20-30%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                <span>&gt;30%</span>
              </div>
            </div>
          </div>

          {/* Ranking tables */}
          <div className="space-y-4">
            <div className="flex gap-1 rounded-md border bg-muted/30 p-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
                    activeTab === tab.id
                      ? 'bg-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'provinces' && (
              <div className="rounded-md border">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="border-b bg-muted/50 px-3 py-2 text-left text-xs font-medium">{t('portal.fwaAnalytics.province')}</th>
                      <th className="border-b bg-muted/50 px-3 py-2 text-right text-xs font-medium">{t('portal.fwaAnalytics.flagged')}</th>
                      <th className="border-b bg-muted/50 px-3 py-2 text-right text-xs font-medium">{t('portal.fwaAnalytics.rate')}</th>
                      <th className="border-b bg-muted/50 px-3 py-2 text-right text-xs font-medium">{t('portal.fwaAnalytics.avgScore')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byProvince
                      .sort((a, b) => b.flaggedClaims - a.flaggedClaims)
                      .slice(0, 10)
                      .map((p) => (
                        <tr
                          key={p.name}
                          className="border-b last:border-0 transition-colors hover:bg-muted/50"
                          onMouseEnter={() => setHoveredProvince(p)}
                          onMouseLeave={() => setHoveredProvince(null)}
                        >
                          <td className="px-3 py-2 text-xs">
                            {p.name}
                            {p.nameTh && <span className="ml-1 text-muted-foreground">({p.nameTh})</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-mono">
                            {p.flaggedClaims}/{p.totalClaims}
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-mono">{p.detectionRate.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right text-xs font-mono">{p.avgRiskScore.toFixed(1)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {activeTab === 'cities' && <HotspotTable data={byCity} label={t('portal.fwaAnalytics.city')} />}
            {activeTab === 'providers' && <HotspotTable data={byProvider} label={t('portal.fwaAnalytics.provider')} />}
            {activeTab === 'brokers' && <HotspotTable data={byBroker} label={t('portal.fwaAnalytics.broker')} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
