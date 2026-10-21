/**
 * Demo viewer world — the shape /api/demo/viewer-world returns (mirror of
 * src/lib/demo-viewer-world.server.ts DemoViewerWorld, client-safe, no Admin SDK).
 */
export interface DemoViewerPlace {
  id: string;
  name: string;
}

export interface DemoViewerWorld {
  viewer: true;
  home: { cityId: string; cityName: string; neighborhoodId: string | null; neighborhoodName: string | null };
  cities: DemoViewerPlace[];
  groupIds: string[];
}
