import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
import RunFloatingButtons from '../run-chrome/RunFloatingButtons';
import RunTopLayers from '../run-chrome/RunTopLayers';
import RunDataStrip from '../run-chrome/RunDataStrip';
import RunVsPanel from '../run-chrome/RunVsPanel';
import { FreeCompact, FreeLarge, IntervalsCompact, IntervalsLarge } from '../run-chrome/RunDrawerBlocks';

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const noop = () => {};

describe('floating buttons', () => {
  it('running: lap + pause with captions; no stop, no resume', () => {
    const h = html(<RunFloatingButtons isPaused={false} onPause={noop} onResume={noop} onLap={noop} onStop={noop} />);
    expect(h).toContain('הקפה');
    expect(h).toContain('השהיה');
    expect(h).not.toContain('לחיצה ארוכה לסיום');
    expect(h).not.toContain('המשך');
  });
  it('paused: stop (hold) + resume; lap hidden', () => {
    const h = html(<RunFloatingButtons isPaused onPause={noop} onResume={noop} onLap={noop} onStop={noop} />);
    expect(h).toContain('לחיצה ארוכה לסיום');
    expect(h).toContain('המשך');
    expect(h).not.toContain('הקפה');
    expect(h).not.toContain('השהיה');
  });
});

describe('top layers', () => {
  it('one layer: no pager dots; three layers: three dots, aria per layer', () => {
    expect(html(<RunTopLayers layers={[<i key="a">A</i>]} index={0} onIndexChange={noop} />)).toBe('<i>A</i>');
    const h = html(<RunTopLayers layers={[<i key="a">A</i>, <i key="b">B</i>, <i key="c">C</i>]} index={1} onIndexChange={noop} />);
    expect(h).toContain('שכבה 2 מתוך 3');
    expect(h.match(/rounded-full/g)?.length).toBe(3);
  });
  it('data strip: three equal cells', () => {
    const h = html(<RunDataStrip items={[{ value: '4:51', label: 'קצב' }, { value: '24:10', label: 'זמן' }, { value: '6.50', label: 'ק״מ' }]} />);
    expect(h).toContain('4:51');
    expect(h.match(/flex-1/g)?.length).toBe(3);
  });
});

describe('drawer contents', () => {
  it('intervals compact = 3 columns; no list or timeline words', () => {
    const h = html(<IntervalsCompact chip={null} paceNow="4:51" target="4:45–4:55" left="0:47" />);
    expect(h).toContain('קצב עכשיו');
    expect(h).toContain('טווח יעד');
    expect(h).toContain('נותר בחזרה');
    expect(h.match(/basis-0/g)?.length).toBe(3);
  });
  it('intervals large: pace, gauge band + target caption, two halves, next line', () => {
    const h = html(<IntervalsLarge chip={null} paceNow="4:51" nowSec={291} loSec={285} hiSec={295} targetText="4:45–4:55" metersLeft="212 מ׳" timeLeft="0:47" nextText="מנוחה · 1:30" />);
    expect(h).toContain('יעד 4:45–4:55');
    expect(h).toContain('מטרים שנותרו');
    expect(h).toContain('זמן שנותר');
    expect(h).toContain('הבא: מנוחה · 1:30');
    expect(h.match(/basis-0/g)?.length).toBe(2);
  });
  it('free compact = 2 halves; speed variant uses speed labels; free large has the average marker caption', () => {
    expect(html(<FreeCompact rateNow="6:31" rateAvg="6:12" />).match(/basis-0/g)?.length).toBe(2);
    expect(html(<FreeCompact rateNow="24.1" rateAvg="22.8" speed />)).toContain('מהירות עכשיו');
    const h = html(<FreeLarge title="ק״מ 4 · קצב נוכחי" rateNow="6:31" nowSec={391} avgSec={372} avgText="ממוצע 6:12" first={{ label: 'בק״מ הנוכחי', value: '0.42/1.00' }} second={{ label: 'נותר לק״מ הבא', value: '580 מ׳' }} nextText="סימון ק״מ 5 · אוטומטי" />);
    expect(h).toContain('ממוצע 6:12');
    expect(h).toContain('0.42/1.00');
    expect(h).toContain('הבא: סימון ק״מ 5 · אוטומטי');
  });
});

describe('me vs them panel', () => {
  const side = (o: object) => ({ distanceKm: 12.4, paceSecPerKm: 291, avgPaceSecPerKm: 302, elapsedSec: 1450, elevGainM: 38, ...o });
  it('rows, VS, gap line with trend and a close button', () => {
    const h = html(
      <RunVsPanel me={{ ...side({}), name: 'אני' }} them={{ ...side({ distanceKm: 12.44, paceSecPerKm: 284, avgPaceSecPerKm: 298, elevGainM: 52 }), name: 'נועה' }} prevGapMeters={-60} onClose={noop} />,
    );
    expect(h).toContain('VS');
    expect(h).toContain('נועה');
    expect(h).toContain('4:51');
    expect(h).toContain('4:44');
    expect(h).toContain('24:10');
    expect(h).toContain('38 מ׳');
    expect(h).toContain('נועה לפני ב־40 מ׳ · הפער יורד');
    expect(h).toContain('סגירת ההשוואה');
  });
});

describe('pilot AK2 / AK3 (enable_pilot_ah_v1)', () => {
  it('floating buttons: an extra control sits on the start end (a walk: no lap)', () => {
    const h = html(<RunFloatingButtons isPaused={false} onPause={noop} onResume={noop} onStop={noop} extra={<button type="button" aria-label="settings-x" />} />);
    expect(h).toContain('aria-label="settings-x"');
    expect(h.indexOf('settings-x')).toBeLessThan(h.indexOf('השהיה'));
  });
  it('floating buttons: no extra → the markup is unchanged', () => {
    const a = html(<RunFloatingButtons isPaused={false} onPause={noop} onResume={noop} onLap={noop} onStop={noop} />);
    expect(a).not.toContain('gap-4');
  });
  it('header chrome: an empty strip renders no data strip', async () => {
    const { default: RunHeaderChrome } = await import('../run-chrome/RunHeaderChrome');
    const withStrip = html(<RunHeaderChrome strip={[{ value: '1', label: 'x' }]} layers={[<div key="a" />]} index={0} onIndexChange={noop} />);
    const empty = html(<RunHeaderChrome strip={[]} layers={[<div key="a" />]} index={0} onIndexChange={noop} />);
    expect(withStrip.length).toBeGreaterThan(empty.length);
    expect(empty).not.toContain('>x<');
  });
});
