import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { MAPS } from '../src/game/maps';

describe('ten destination choices', () => {
  it('renders every destination with its route shape, node count, and climate note', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html.match(/<button[^>]*class="map-option /g)).toHaveLength(10);
    for (const mapId of ['lake', 'coast', 'valley', 'sundered', 'forest', 'starSands', 'ashCanyon', 'peachHaven', 'hushedValley', 'grandCity'] as const) {
      const map = MAPS[mapId];
      expect(html).toContain(map.name);
      expect(html).toContain(map.subtitle);
      expect(html).toContain(`${map.nodes.length} 格`);
    }
    expect(html).toContain('温和气候 · 高价地产');
    expect(html).toContain('炎热干旱 · 双环沙洲');
    expect(html).toContain('data-map="lake"');
    expect(html).not.toContain('选择地图与旅伴。');
    expect(html).toContain('峡谷气候 · 风寒多变');
    expect(html).toContain('湖岸气候 · 桃溪田园');
    expect(html).toContain('荒野河谷 · 五层地标');
    expect(html).toContain('预制都会 · 150,000 PM');
    expect(html).toMatch(/<span class="map-number">10<\/span><span class="map-option-main"><span class="map-option-heading"><strong>伟岸之城<\/strong>/);
    expect(html).not.toContain('<span class="map-number">010</span>');
  });
});
