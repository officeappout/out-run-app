/**
 * Server-side loader for shared workouts.
 *
 * Uses the Firestore REST API so it works in React Server Components
 * and `generateMetadata` without pulling in the full client SDK.
 */

const PROJECT_ID = 'appout-1';

interface FirestoreValue {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
  nullValue?: null;
}

function unwrap(val: FirestoreValue | undefined): any {
  if (!val) return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) return (val.arrayValue?.values ?? []).map(unwrap);
  if ('mapValue' in val) {
    const obj: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue?.fields ?? {})) {
      obj[k] = unwrap(v);
    }
    return obj;
  }
  return undefined;
}

export interface SharedWorkoutMeta {
  title: string;
  description: string;
  difficulty: number;
  estimatedDuration: number;
  exerciseCount: number;
  muscles: string[];
  equipment: string[];
  structure: string;
}

export async function fetchSharedWorkoutMeta(docId: string): Promise<SharedWorkoutMeta | null> {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/sharedWorkouts/${docId}?mask.fieldPaths=title&mask.fieldPaths=description&mask.fieldPaths=difficulty&mask.fieldPaths=estimatedDuration&mask.fieldPaths=exerciseCount&mask.fieldPaths=muscles&mask.fieldPaths=equipment&mask.fieldPaths=structure`;

    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;

    const json = await res.json();
    if (!json.fields) return null;

    const f = json.fields;
    return {
      title: unwrap(f.title) ?? '',
      description: unwrap(f.description) ?? '',
      difficulty: unwrap(f.difficulty) ?? 2,
      estimatedDuration: unwrap(f.estimatedDuration) ?? 0,
      exerciseCount: unwrap(f.exerciseCount) ?? 0,
      muscles: unwrap(f.muscles) ?? [],
      equipment: unwrap(f.equipment) ?? [],
      structure: unwrap(f.structure) ?? 'standard',
    };
  } catch (err) {
    console.error('[SharedWorkoutLoader] REST fetch failed:', err);
    return null;
  }
}
