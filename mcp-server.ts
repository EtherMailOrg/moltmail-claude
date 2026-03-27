import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadWallet } from "./lib/wallet.ts";
import {
    loadAuth,
    getConfiguredAddress,
    getEmailFromWallet,
    getWalletNonce,
    loginWalletInbox,
    saveLoginToken,
    completeOnboarding,
    getReferralCode,
    listMailboxes,
    searchEmails,
    getEmailContent,
    markEmailAsRead,
    sendEmail,
    replyToEmail,
    listAddresses,
    getEarnedCoins,
} from "./lib/ethermail.ts";

const WEB3_LOGIN_MESSAGE = "By signing this message you agree to the Terms and Conditions and Privacy Policy";

const server = new McpServer({
    name: "moltmail",
    version: "1.0.0",
});

// --- Login ---
server.tool(
    "login",
    "Authenticate with MoltMail using the configured wallet. Returns the auth token. For new accounts, completes onboarding automatically.",
    {},
    async () => {
        try {
            const wallet = await loadWallet();
            const nonce = await getWalletNonce(wallet.address);
            const signMessage = `${WEB3_LOGIN_MESSAGE}\n\nNONCE: ${nonce}`;
            const signature = await wallet.signMessage(signMessage);

            const afid = nonce <= 1 ? await getReferralCode() : undefined;
            const token = await loginWalletInbox(wallet.address, signature, false, afid);
            await saveLoginToken(token);

            if (nonce <= 1) {
                await completeOnboarding(wallet.address);
            }

            return { content: [{ type: "text", text: JSON.stringify({ success: true, message: "Login successful" }) }] };
        } catch (err: any) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }], isError: true };
        }
    }
);

// --- List Mailboxes ---
server.tool(
    "list_mailboxes",
    "List all mailboxes with unread/total counts.",
    {},
    async () => {
        try {
            const { userId } = await loadAuth();
            const result = await listMailboxes(userId);
            return { content: [{ type: "text", text: JSON.stringify({ success: true, results: result }) }] };
        } catch (err: any) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }], isError: true };
        }
    }
);

// --- Search Emails ---
server.tool(
    "search_emails",
    "Search emails in a specific mailbox. Default: INBOX, page 1, limit 10.",
    {
        mailboxId: z.string().describe("The mailbox ID from list_mailboxes"),
        page: z.number().optional().describe("Page number, starts at 1"),
        limit: z.number().optional().describe("Emails per page, default 10"),
        nextCursor: z.string().optional().describe("Cursor for pagination, only when page > 1"),
    },
    async ({ mailboxId, page, limit, nextCursor }) => {
        try {
            const { userId } = await loadAuth();
            const result = await searchEmails(userId, mailboxId, page ?? 1, limit ?? 10, nextCursor);
            return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result }) }] };
        } catch (err: any) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }], isError: true };
        }
    }
);

// --- Get Email Content ---
server.tool(
    "get_email",
    "Get full email content and automatically mark it as read.",
    {
        mailboxId: z.string().describe("The mailbox ID"),
        messageId: z.string().describe("The message ID from search_emails"),
    },
    async ({ mailboxId, messageId }) => {
        try {
            const { userId } = await loadAuth();
            const email = await getEmailContent(userId, mailboxId, messageId);
            await markEmailAsRead(userId, mailboxId, messageId);
            return { content: [{ type: "text", text: JSON.stringify({ success: true, ...email }) }] };
        } catch (err: any) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }], isError: true };
        }
    }
);

// --- Mark as Read ---
server.tool(
    "mark_read",
    "Mark an email as read without fetching its content.",
    {
        mailboxId: z.string().describe("The mailbox ID"),
        messageId: z.string().describe("The message ID"),
    },
    async ({ mailboxId, messageId }) => {
        try {
            const { userId } = await loadAuth();
            const result = await markEmailAsRead(userId, mailboxId, messageId);
            return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result }) }] };
        } catch (err: any) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }], isError: true };
        }
    }
);

// --- Send Email ---
server.tool(
    "send_email",
    "Send an email from the configured wallet address.",
    {
        to: z.string().describe("Recipient email address"),
        subject: z.string().describe("Email subject"),
        html: z.string().describe("Email body as HTML"),
        fromAlias: z.string().optional().describe("Send from an alias instead of the default wallet address"),
    },
    async ({ to, subject, html, fromAlias }) => {
        try {
            const { userId } = await loadAuth();
            const walletAddress = await getConfiguredAddress();
            const fromEmail = fromAlias || getEmailFromWallet(walletAddress);

            const result = await sendEmail(userId, {
                from: { name: "", address: fromEmail },
                to: [{ name: "", address: to }],
                subject,
                html,
            });
            return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result }) }] };
        } catch (err: any) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }], isError: true };
        }
    }
);

// --- Reply to Email ---
server.tool(
    "reply_email",
    "Reply to an existing email.",
    {
        to: z.string().describe("Recipient email address"),
        subject: z.string().describe("Reply subject"),
        html: z.string().describe("Reply body as HTML"),
        originalMessageId: z.string().describe("The ID of the email being replied to"),
        mailboxId: z.string().describe("The mailbox ID of the original email"),
        fromAlias: z.string().optional().describe("Reply from an alias"),
    },
    async ({ to, subject, html, originalMessageId, mailboxId, fromAlias }) => {
        try {
            const { userId } = await loadAuth();
            const walletAddress = await getConfiguredAddress();
            const fromEmail = fromAlias || getEmailFromWallet(walletAddress);

            const result = await replyToEmail(userId, {
                from: { name: "", address: fromEmail },
                to: [{ name: "", address: to }],
                subject,
                html,
                reference: {
                    action: "reply",
                    id: originalMessageId,
                    mailbox: mailboxId,
                },
            });
            return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result }) }] };
        } catch (err: any) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }], isError: true };
        }
    }
);

// --- List Aliases ---
server.tool(
    "list_aliases",
    "List all configured email aliases that can be used as sender addresses.",
    {},
    async () => {
        try {
            const result = await listAddresses();
            return { content: [{ type: "text", text: JSON.stringify({ success: true, results: result }) }] };
        } catch (err: any) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }], isError: true };
        }
    }
);

// --- Get Earned Coins (EMC) ---
server.tool(
    "get_earned_coins",
    "Get the user's available EMC (EtherMail Coins) from the rewards pool.",
    {},
    async () => {
        try {
            await loadAuth();
            const emcAvailable = await getEarnedCoins();
            return { content: [{ type: "text", text: JSON.stringify({ success: true, emc_available: emcAvailable }) }] };
        } catch (err: any) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }], isError: true };
        }
    }
);

// --- Get Referral Code ---
server.tool(
    "get_referral_code",
    "Get the user's referral code (their user ID).",
    {},
    async () => {
        try {
            const { userId } = await loadAuth();
            return { content: [{ type: "text", text: JSON.stringify({ success: true, referralCode: userId }) }] };
        } catch (err: any) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }], isError: true };
        }
    }
);

// --- Get Wallet Info ---
server.tool(
    "get_wallet_info",
    "Get the configured wallet address and email.",
    {},
    async () => {
        try {
            const address = await getConfiguredAddress();
            const email = getEmailFromWallet(address);
            return { content: [{ type: "text", text: JSON.stringify({ success: true, address, email }) }] };
        } catch (err: any) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }], isError: true };
        }
    }
);

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MoltMail MCP server running on stdio");
}

main().catch((err) => {
    console.error("Failed to start MCP server:", err);
    process.exit(1);
});
