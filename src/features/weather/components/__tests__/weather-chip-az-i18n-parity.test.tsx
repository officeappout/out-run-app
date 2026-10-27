/**
 * i18n wave 2 batch az (namespace `map`, keys weather.*): the WeatherChip aria-label, recorded BEFORE the
 * extraction. Static markup (react-dom/server), `<!-- -->` stripped. The label hint comes from the
 * classification (service text, unchanged).
 */
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import WeatherChip from '../WeatherChip';
import type { HomeWeather } from '../../hooks/useWeather';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/weather-chip-az-i18n/${name}.html`;

const make = (flag: string, label: string | null, provider = 'open-meteo'): HomeWeather =>
  ({
    snapshot: { provider },
    classification: { flag, label },
    workoutWeather: {},
    temperatureC: 23.6,
    weatherCode: 1,
    isNight: false,
  }) as unknown as HomeWeather;

it.each([
  ['hint', make('rain', 'גשם בקרוב')],
  ['no-hint', make('none', null)],
  ['ims', make('heat', 'חם', 'ims')],
])('chip: %s', async (name, w) => {
  await expect(html(<WeatherChip weather={w} />)).toMatchFileSnapshot(snap(name));
});
