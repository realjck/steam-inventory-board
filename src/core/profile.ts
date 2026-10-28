/** Owner's names from the public Steam profile, shown in the page title. */

export type Profile = { personaName: string; customUrl: string | null };

type FetchFn = (url: string) => Promise<Response>;

/** Text of <tag><![CDATA[…]]></tag>; Steam wraps every free-text field of the profile XML in CDATA. */
function cdata(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
  const value = match?.[1].trim();
  return value ? value : null;
}

export async function fetchProfile(steamId: string, fetchFn: FetchFn = fetch): Promise<Profile> {
  const res = await fetchFn(`https://steamcommunity.com/profiles/${steamId}?xml=1`);
  if (!res.ok) throw new Error(`Profile request failed: HTTP ${res.status}`);
  const xml = await res.text();
  const personaName = cdata(xml, "steamID");
  if (!personaName) throw new Error(`Steam returned no profile for ${steamId}`);
  return { personaName, customUrl: cdata(xml, "customURL") };
}

export function inventoryTitle(profile: Profile | null): string {
  return profile ? `${profile.personaName}'s inventory` : "My Steam inventory";
}
