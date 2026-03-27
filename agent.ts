import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SYSTEM_PROMPT = `You are a MoltMail email agent — a Web3 email assistant built on moltmail.io.

You help users manage their Web3 email account: send/receive emails, check inbox, manage aliases.

## Important Behaviors
- Always login first if not already authenticated.
- After login, list mailboxes to know the INBOX mailbox ID.
- Default to the INBOX mailbox unless the user specifies otherwise.
- When reading emails, present: sender, subject, date, body, and highlight badge types:
  - **paymail**: Payment Notification
  - **eaaw**: Interactive Email (MoltMail As A Wallet)
  - **community**: Official Communication
  - **paywall**: Read2Earn (user earns EMT tokens by reading)
- Before sending/replying, confirm the subject and content with the user.
- Poll responsibly — wait 5 seconds between checks.
- Don't login again if there's a valid token.

## Available Tools
You have MCP tools for: login, list_mailboxes, search_emails, get_email, mark_read, send_email, reply_email, list_aliases, get_referral_code, get_wallet_info.
`;

async function main() {
    const userMessage = process.argv.slice(2).join(" ") || "Check my inbox for new emails";

    // Start MCP server as a subprocess
    const transport = new StdioClientTransport({
        command: "npx",
        args: ["tsx", "mcp-server.ts"],
        cwd: process.cwd(),
        env: { ...process.env } as Record<string, string>,
    });

    const mcpClient = new Client({ name: "moltmail-agent", version: "1.0.0" });
    await mcpClient.connect(transport);

    // Discover MCP tools
    const { tools: mcpTools } = await mcpClient.listTools();
    const anthropicTools: Anthropic.Tool[] = mcpTools.map((tool) => {
        const { $schema, ...schema } = tool.inputSchema as Record<string, unknown>;
        return {
            name: tool.name,
            description: tool.description || "",
            input_schema: {
                type: "object" as const,
                ...schema,
            } as Anthropic.Tool["input_schema"],
        };
    });

    const client = new Anthropic();
    const messages: Anthropic.MessageParam[] = [
        { role: "user", content: userMessage },
    ];

    console.log(`\n📧 MoltMail Agent`);
    console.log(`> ${userMessage}\n`);

    // Agent loop
    let continueLoop = true;
    while (continueLoop) {
        const response = await client.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: anthropicTools,
            messages,
        });

        // Collect assistant response
        const assistantContent = response.content;
        messages.push({ role: "assistant", content: assistantContent });

        // Process each content block
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of assistantContent) {
            if (block.type === "text") {
                console.log(block.text);
            } else if (block.type === "tool_use") {
                console.log(`  🔧 ${block.name}(${JSON.stringify(block.input)})`);

                try {
                    const result = await mcpClient.callTool({
                        name: block.name,
                        arguments: block.input as Record<string, unknown>,
                    });

                    const resultText = result.content
                        ?.map((c: any) => (c.type === "text" ? c.text : ""))
                        .join("") || "{}";

                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: block.id,
                        content: resultText,
                    });
                } catch (err: any) {
                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: block.id,
                        content: JSON.stringify({ error: err.message }),
                        is_error: true,
                    });
                }
            }
        }

        if (toolResults.length > 0) {
            messages.push({ role: "user", content: toolResults });
        }

        // Stop if no more tool calls
        if (response.stop_reason === "end_turn") {
            continueLoop = false;
        }
    }

    await mcpClient.close();
}

main().catch((err) => {
    console.error("Agent error:", err.message);
    process.exit(1);
});
