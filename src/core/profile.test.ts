import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchProfile, inventoryTitle } from "./profile.ts";

const XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<profile>
	<steamID64>76561198078288325</steamID64>
	<steamID><![CDATA[Real]]></steamID>
	<customURL><![CDATA[realjck]]></customURL>
</profile>`;

function fakeFetch(body: string, status = 200) {
  const urls: string[] = [];
  const fn = async (url: string) => {
    urls.push(url);
    return new Response(body, { status });
  };
  return { fn, urls };
}

test("fetchProfile reads the persona name and custom URL from the public profile XML", async () => {
  const { fn, urls } = fakeFetch(XML);

  assert.deepEqual(await fetchProfile("76561198078288325", fn), { personaName: "Real", customUrl: "realjck" });
  assert.equal(urls[0], "https://steamcommunity.com/profiles/76561198078288325?xml=1");
});

test("fetchProfile leaves out a missing or empty custom URL", async () => {
  const { fn } = fakeFetch(XML.replace("<![CDATA[realjck]]>", ""));

  assert.deepEqual(await fetchProfile("76561198078288325", fn), { personaName: "Real", customUrl: null });
});

test("fetchProfile rejects when Steam does not answer with a profile", async () => {
  await assert.rejects(fetchProfile("76561198078288325", fakeFetch("", 500).fn), /HTTP 500/);
  await assert.rejects(fetchProfile("76561198078288325", fakeFetch("<response><error>x</error></response>").fn), /no profile/);
});

test("inventoryTitle names the owner, or falls back without a profile", () => {
  assert.equal(inventoryTitle({ personaName: "Real", customUrl: "realjck" }), "Real's inventory");
  assert.equal(inventoryTitle(null), "My Steam inventory");
});
