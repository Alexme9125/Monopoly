import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { MAPS } from '../src/game/maps';

describe('six destination choices', () => {
  it('renders every destination with its route shape, node count, and climate note', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html.match(/<button[^>]*class="map-option /g)).toHaveLength(6);
    for (const mapId of ['lake', 'coast', 'valley', 'sundered', 'forest', 'starSands'] as const) {
      const map = MAPS[mapId];
      expect(html).toContain(map.name);
      expect(html).toContain(map.subtitle);
      expect(html).toContain(`${map.nodes.length} 格`);
    }
    expect(html).toContain('温和气候 · 高价地产');
    expect(html).toContain('炎热干旱 · 双环沙洲');
    expect(html).toContain('data-map="lake"');
  });
});
