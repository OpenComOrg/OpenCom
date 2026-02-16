import { command, createServerContext, optionString } from "../../lib/opencom-extension-sdk.js";


function getSkillLevel(username) {
    return 0
}

function getsSlayerLevel(username, slayer) {
    return 0
}

function getDungeonLevel(username) {
    return 0
}


export const commands = [
  command({
    name: "sb-plugin",
    description: "Simple command to test the extension",
    options: [optionString("text", "Optional message", false)],
    async execute(ctx) {
      const input = String(ctx.args?.text || "Skyblock Utils Plugin is working!");
      const me = await ctx.apis.node.get("/v1/me").catch(() => null);
      return {
        content: `${input}`,
        user: me?.user?.username || ctx.userId,
        serverId: ctx.serverId
      };
    }
  }),
  command({
    name: "slayer",
    description: "Simple command to test the extension",
    options: [optionString("username", "Minecraft username", true), optionString("slayer", "Which slayer boss (zombie, spider, wolf)", true)],
    async execute(ctx) {
        const username = String(ctx.args?.username);
        const slayer = String(ctx.args?.slayer);
        const slayerLevel = getsSlayerLevel(username, slayer);
        const input = `${username}'s ${slayer} slayer level is ${slayerLevel}`;
        const me = await ctx.apis.node.get("/v1/me").catch(() => null);
      return {
        content: `${input}`,
        user: me?.user?.username || ctx.userId,
        serverId: ctx.serverId
      };
    }
  }),
  command({
    name: "skill",
    description: "Get a player's skill level",
    options: [optionString("username", "Minecraft username", true), optionString("skill", "Which skill", true)],
    async execute(ctx) {
        const username = String(ctx.args?.username);
        const skill = String(ctx.args?.slayer);
        const skillLevel = getsSlayerLevel(username, skill);
        const input = `${username}'s ${skill} level is ${skillLevel}`;
        const me = await ctx.apis.node.get("/v1/me").catch(() => null);
        return {
        content: `${input}`,
        user: me?.user?.username || ctx.userId,
        serverId: ctx.serverId
      };
    }
  }),
  command({
    name: "dungeon",
    description: "Get a player's catacombs level",
    options: [optionString("username", "Minecraft username", true)],
    async execute(ctx) {
        const username = String(ctx.args?.username);
        const cata = getDungeonLevel(username);
        const input = `${username} is catacombs ${cata}`;
        const me = await ctx.apis.node.get("/v1/me").catch(() => null);
        return {
        content: `${input}`,
        user: me?.user?.username || ctx.userId,
        serverId: ctx.serverId
      };
    }
  }),
];

export async function activate(ctx) {
  const context = createServerContext(ctx);
  context.log(`Activated for server ${ctx.serverId}`);
}

export async function deactivate(ctx) {
  const context = createServerContext(ctx);
  context.log(`Deactivated for server ${ctx.serverId}`);
}
