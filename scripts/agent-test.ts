/**
 * Agent test for @tenkicloud/composio-tools.
 *
 * A minimal agentic loop against any OpenAI-compatible chat-completions API:
 * the model is instructed to boot a Tenki sandbox, inspect it with a shell
 * command, and clean up — using ONLY the LOCAL_TENKI_* tools bound to a real
 * Composio session. Works with OpenAI, gateways (OpenRouter/Groq/self-hosted),
 * and Anthropic via its OpenAI-compatible endpoint.
 *
 * Architecture note: custom tools are SESSION-scoped, so tool calls are
 * executed via session.execute() — not provider handleToolCalls helpers, which
 * go through Composio's global execute path and cannot see session-bound
 * custom tools. Tool definitions come from session.customTools().
 *
 * Requires in .env (or exported):
 *   COMPOSIO_API_KEY  (https://app.composio.dev)
 *   TENKI_API_KEY     (https://app.tenki.cloud)
 *   LLM_API_KEY       (falls back to OPENAI_API_KEY, then ANTHROPIC_API_KEY)
 *   LLM_MODEL         e.g. gpt-5, anthropic/opus-5 — whatever your endpoint serves
 * Optional:
 *   LLM_BASE_URL      default https://api.openai.com/v1
 *
 * Usage: pnpm agent
 */
import OpenAI from 'openai';
import type {
  ChatCompletionFunctionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { Composio } from '@composio/core';
import 'dotenv/config';
import { tenkiToolkit } from '../src/index';

const MAX_TURNS = 10;

const TASK = [
  'Boot a fresh Tenki sandbox, then find out which Linux kernel version and OS distribution',
  'it runs by executing a shell command inside it. When you have the answer, terminate the',
  'sandbox to free resources, then report: (1) kernel version, (2) distribution, and',
  '(3) confirmation that the sandbox was terminated.',
].join(' ');

const line = (title: string) =>
  console.log(`\n━━━ ${title} ${'━'.repeat(Math.max(0, 60 - title.length))}`);

async function main(): Promise<void> {
  const llmApiKey =
    process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  const model = process.env.LLM_MODEL;
  for (const [name, value] of [
    ['COMPOSIO_API_KEY', process.env.COMPOSIO_API_KEY],
    ['TENKI_API_KEY', process.env.TENKI_API_KEY],
    ['LLM_API_KEY (or OPENAI_API_KEY / ANTHROPIC_API_KEY)', llmApiKey],
    ['LLM_MODEL', model],
  ] as const) {
    if (!value) {
      console.error(`❌ Missing ${name} — add it to .env`);
      process.exit(1);
    }
  }

  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  const llm = new OpenAI({
    apiKey: llmApiKey,
    baseURL: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
  });

  line('Session setup');
  const session = await composio.sessions.create('default', {
    experimental: { customToolkits: [tenkiToolkit()] },
  });
  console.log(`✅ Composio session: ${session.sessionId}`);
  console.log(`✅ LLM: ${model} via ${process.env.LLM_BASE_URL ?? 'api.openai.com'}`);

  // Build tool definitions straight from the session's custom-tool registry.
  const tools: ChatCompletionFunctionTool[] = session
    .customTools({ toolkit: 'TENKI' })
    .map(tool => ({
      type: 'function',
      function: {
        name: tool.slug,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  console.log(`✅ Tools exposed: ${tools.map(t => t.function.name).join(', ')}`);

  // Verification trackers
  const liveSandboxes = new Set<string>();
  let sawCreate = false;
  let sawSuccessfulExec = false;
  let sawTerminate = false;
  let finalText = '';

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content:
        'You are an infrastructure agent. Use only the provided tools to complete the task. ' +
        'Always terminate any sandbox you created before giving your final answer.',
    },
    { role: 'user', content: TASK },
  ];

  try {
    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      line(`Turn ${turn} → ${model}`);
      const response = await llm.chat.completions.create({
        model: model!,
        messages,
        tools,
        tool_choice: 'auto',
      });

      const message = response.choices[0]?.message;
      if (!message) throw new Error('LLM returned no choices');

      if (typeof message.content === 'string' && message.content.trim()) {
        console.log(`🤖 ${message.content.trim()}`);
        finalText = message.content;
      }

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        console.log(`(finish_reason=${response.choices[0]?.finish_reason})`);
        break;
      }

      messages.push(message);

      for (const toolCall of toolCalls) {
        if (toolCall.type !== 'function') continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          console.error(`⚠️  Unparseable arguments for ${toolCall.function.name}`);
        }
        console.log(`🔧 ${toolCall.function.name} ${JSON.stringify(args)}`);

        const result = await session.execute(toolCall.function.name, args);
        const data = result.data ?? {};
        console.log(`   → ${JSON.stringify(data).slice(0, 400)}`);

        // Track lifecycle for verification + cleanup safety net
        if (toolCall.function.name === 'LOCAL_TENKI_CREATE_SANDBOX' && data.success === true) {
          sawCreate = true;
          if (typeof data.sessionId === 'string') liveSandboxes.add(data.sessionId);
        }
        if (toolCall.function.name === 'LOCAL_TENKI_EXEC_COMMAND' && data.exitCode === 0) {
          sawSuccessfulExec = true;
        }
        if (
          toolCall.function.name === 'LOCAL_TENKI_TERMINATE_SANDBOX' &&
          data.terminated === true
        ) {
          sawTerminate = true;
          if (typeof args.sessionId === 'string') liveSandboxes.delete(args.sessionId);
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(data),
        });
      }
    }
  } finally {
    // Safety net: never leave a paid microVM running, whatever the agent did.
    for (const id of liveSandboxes) {
      line('Cleanup (safety net)');
      try {
        await session.execute('LOCAL_TENKI_TERMINATE_SANDBOX', { sessionId: id });
        console.log(`🧹 Terminated leftover sandbox ${id}`);
      } catch (error) {
        console.error(`⚠️  Could not terminate ${id} — do it manually:`, error);
      }
    }
  }

  line('Verification');
  const checks: Array<[string, boolean]> = [
    ['agent created a sandbox', sawCreate],
    ['agent ran a command successfully (exitCode 0)', sawSuccessfulExec],
    ['agent terminated the sandbox itself', sawTerminate],
    ['no sandboxes leaked', liveSandboxes.size === 0],
    ['agent produced a final answer', finalText.trim().length > 0],
  ];
  for (const [label, ok] of checks) console.log(`${ok ? '✅' : '❌'} ${label}`);

  if (checks.every(([, ok]) => ok)) {
    console.log('\nAgent test passed. 🎉');
  } else {
    console.error('\nAgent test failed.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Agent test crashed:', error);
  process.exit(1);
});
