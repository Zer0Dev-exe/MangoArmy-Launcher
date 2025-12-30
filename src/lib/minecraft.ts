export interface MCVersion {
    id: string;
    type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
    url: string;
}

export interface PaperVersion {
    version: string;
    builds: number[];
}

export async function getVanillaVersions(): Promise<MCVersion[]> {
    const response = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
    const data = await response.json();
    return data.versions;
}

export async function getFabricVersions(gameVersion: string): Promise<any[]> {
    const response = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${gameVersion}`);
    if (!response.ok) return [];
    return await response.json();
}

export async function getPaperVersions(): Promise<string[]> {
    const response = await fetch('https://api.papermc.io/v2/projects/paper');
    const data = await response.json();
    return data.versions;
}

export async function getPaperBuilds(version: string): Promise<number[]> {
    const response = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${version}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.builds;
}

export async function checkPaperExists(version: string): Promise<boolean> {
    const response = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${version}`);
    return response.ok;
}

export async function checkFabricExists(version: string): Promise<boolean> {
    const response = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${version}`);
    if (!response.ok) return false;
    const data = await response.json();
    return data.length > 0;
}
