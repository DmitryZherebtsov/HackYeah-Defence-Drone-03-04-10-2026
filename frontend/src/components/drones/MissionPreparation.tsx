import React from 'react';
import { ArrowLeft, CheckCircle2, Circle, Cpu, Loader2, Play, Radio, Wrench } from 'lucide-react';
import type { MissionViewProps } from '../../pages/MissionPage';
import { PHASE_LABELS } from '../../types/drones';
import { MissionMap } from './MissionMap';
import { Badge, SectionCard, WeatherStrip, btnPrimary, btnSecondary, btnSuccess } from './DroneUi';

export const MissionPreparation: React.FC<MissionViewProps> = ({ mission, act, busy }) => {
  const d = mission.data;
  const canCommand = mission.permissions.isCommander;
  const canTech = canCommand || mission.permissions.roles.includes('technik');
  const allDone = d.checklist.every((c) => c.done);
  const infraReady = d.checklist.filter((c) => ['rtk', 'mesh'].includes(c.id)).every((c) => c.done);
  const calibrating = d.drones.some((x) => x.phase === 'kalibracja');

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
      <div className="xl:col-span-2 space-y-5">
        <SectionCard
          title="Procedura przedstartowa – Strefa Zero"
          subtitle="Rozstawienie infrastruktury telekomunikacyjnej i kalibracja floty przed przydziałem sektorów"
          icon={<Radio className="h-5 w-5" />}
        >
          <ol className="space-y-2">
            {d.checklist.map((c, i) => (
              <li key={c.id} className={`rounded-2xl border p-3 ${c.done ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200/80'}`}>
                <div className="flex items-start gap-3">
                  {c.done ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" /> : <Circle className="h-5 w-5 text-slate-300 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-900">
                      {i + 1}. {c.label}
                    </div>
                    <p className="text-[11px] text-slate-500">{c.description}</p>
                    {c.done && c.doneBy && (
                      <p className="text-[10px] text-emerald-700 mt-1">
                        ✓ {c.doneBy} • {c.doneAt ? new Date(c.doneAt).toLocaleTimeString('pl-PL') : ''}
                      </p>
                    )}
                  </div>
                  {!c.automatic && canTech && (
                    <button
                      className={c.done ? btnSecondary : btnSuccess}
                      disabled={busy === `chk-${c.id}`}
                      onClick={() => act(`chk-${c.id}`, 'patch', `/checklist/${c.id}`, { done: !c.done })}
                    >
                      {c.done ? 'Cofnij' : 'Potwierdź'}
                    </button>
                  )}
                  {c.automatic && <Badge className="bg-slate-100 text-slate-600 border-slate-200">System C2</Badge>}
                </div>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap gap-2 mt-4">
            {canTech && (
              <button
                className={btnSecondary}
                disabled={!infraReady || calibrating || d.drones.every((x) => x.calibrated) || busy === 'calibrate'}
                onClick={() => act('calibrate', 'post', '/calibrate')}
                title={!infraReady ? 'Najpierw rozstaw anteny RTK i wzmacniacze MESH' : ''}
              >
                {calibrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                {calibrating ? 'Kalibracja w toku…' : 'Kalibruj i połącz flotę'}
              </button>
            )}
            {canCommand && (
              <>
                <button className={btnSecondary} disabled={busy === 'back'} onClick={() => act('back', 'post', '/back-to-planning')}>
                  <ArrowLeft className="h-4 w-4" /> Wróć do planowania
                </button>
                <button className={`${btnPrimary} ml-auto`} disabled={!allDone || busy === 'start'} onClick={() => act('start', 'post', '/start')}>
                  {busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Zatwierdź plan i rozpocznij operację
                </button>
              </>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Bieżące warunki" icon={<Cpu className="h-5 w-5" />}>
          <WeatherStrip weather={d.weatherOverride ?? d.weather} compact />
        </SectionCard>
      </div>

      <div className="xl:col-span-3 space-y-5">
        <MissionMap base={d.base} radioRangeKm={d.radioRangeKm} area={d.area} noFlyZones={d.noFlyZones} sectors={d.sectors} height="420px" />
        <SectionCard title="Gotowość techniczna floty" icon={<Wrench className="h-5 w-5" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {d.drones.map((x) => {
              const sector = d.sectors.find((s) => s.id === x.sectorId);
              return (
                <div key={x.droneId} className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/80 p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      {sector && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: sector.color }} />}
                      {x.name}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {x.category === 'zwiadowczy' ? (sector ? `Sektor ${sector.index + 1}` : 'Rezerwa') : 'Dron dostawczy – czeka na żądanie zrzutu'}
                    </div>
                  </div>
                  <Badge
                    className={
                      x.phase === 'kalibracja'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : x.calibrated
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                    }
                  >
                    {x.phase === 'kalibracja' && <Loader2 className="h-3 w-3 animate-spin" />}
                    {x.calibrated ? 'Połączony z C2' : PHASE_LABELS[x.phase]}
                  </Badge>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};

export default MissionPreparation;
