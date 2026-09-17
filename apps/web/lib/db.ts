import { createRepository, migrate, pgliteQuery, type MigrationClient, type PGliteLike, type Repository } from '@relay/db';

type PGliteModule = { PGlite: { create(dataDir: string): Promise<MigrationClient & PGliteLike> } };
type RelayGlobal = typeof globalThis & { __relayDb?: Promise<Repository>; __relayTabLock?: Promise<boolean> };

const importModule = new Function('url', 'return import(url)') as (url: string) => Promise<unknown>;

export class OtherTabError extends Error {
    override name = 'OtherTabError';
}

export function loadDatabase(): Promise<Repository> {
    const g = globalThis as RelayGlobal;
    g.__relayDb ??= open(g).catch((err: unknown) => {
        g.__relayDb = undefined;
        throw err;
    });
    return g.__relayDb;
}

async function open(g: RelayGlobal): Promise<Repository> {
    g.__relayTabLock ??= holdTabLock();
    if (!(await g.__relayTabLock)) {
        g.__relayTabLock = undefined;
        throw new OtherTabError(
            'O Relay já está aberto em outra aba. O banco local aceita uma aba por vez.'
        );
    }

    const base = process.env.NEXT_URL_PUBLIC_BASE_PATH ?? '';
    const url = new URL(`${base}/pglite/index.js`, window.location.origin).href;
    const { PGlite } = (await importModule(url)) as PGliteModule;
    const client = await PGlite.create('idb://relay');
    await migrate(client);
    return createRepository(pgliteQuery(client));
}

function holdTabLock(): Promise<boolean> {
    if (!('locks' in navigator)) return Promise.resolve(true);
    return new Promise((resolve) => {
        void navigator.locks.request('relay-db', { ifAvailable: true }, (lock) => {
            if (!lock) {
                resolve(false);
                return;
            }
            resolve(true);
            return new Promise<never>(() => {});
        });
    });
}
