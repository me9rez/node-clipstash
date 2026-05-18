#!/usr/bin/env node
import { typeFlag } from 'type-flag';
import { startServer } from './server.js';
import { startClient, listRemoteItems } from './client.js';
import { initDb, listItems } from './db.js';

const args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);

function printUsage() {
  console.log(`
Clipstash — 剪贴板收藏工具

用法:
  clipstash server   [--port <port>]                     启动 API 服务端 + WebUI
  clipstash client   [--server <url>] [--token <tok>]    启动剪贴板监听客户端
  clipstash list     [--server <url>] [--token <tok>]    列出收藏条目

选项:
  --server, -s  <url>    服务端地址 (默认: env CLIPSTASH_SERVER_URL 或 http://127.0.0.1:3879)
  --token, -t   <tok>    认证令牌 (默认: env CLIPSTASH_TOKEN)
  --port, -p    <port>   服务端端口 (默认: env CLIPSTASH_PORT 或 3879)
  --no-notify            禁用桌面通知
  --help, -h             显示帮助
`);
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  switch (command) {
    case 'server': {
      const parsed = typeFlag(
        {
          port: {
            type: String,
            default: process.env.CLIPSTASH_PORT ?? '3879',
            alias: 'p',
          },
        },
        commandArgs
      );

      const port = parseInt(parsed.flags.port, 10);

      if (isNaN(port) || port < 1 || port > 65535) {
        console.error('Invalid port number');
        process.exit(1);
      }

      startServer(port);
      break;
    }

    case 'client': {
      const parsed = typeFlag(
        {
          server: {
            type: String,
            default: process.env.CLIPSTASH_SERVER_URL ?? 'http://127.0.0.1:3879',
            alias: 's',
          },
          token: {
            type: String,
            default: process.env.CLIPSTASH_TOKEN ?? '',
            alias: 't',
          },
          'no-notify': {
            type: Boolean,
            default: false,
          },
        },
        commandArgs
      );

      const serverUrl = parsed.flags.server as string;
      const token = parsed.flags.token as string;

      if (!token) {
        console.error('Token is required. Set --token or CLIPSTASH_TOKEN env var.');
        process.exit(1);
      }

      if (!serverUrl) {
        console.error('Server URL is required. Set --server or CLIPSTASH_SERVER_URL env var.');
        process.exit(1);
      }

      await startClient({
        serverUrl,
        token,
        notify: !(parsed.flags['no-notify'] as boolean),
      });
      break;
    }

    case 'list': {
      const parsed = typeFlag(
        {
          server: {
            type: String,
            default: process.env.CLIPSTASH_SERVER_URL ?? '',
            alias: 's',
          },
          token: {
            type: String,
            default: process.env.CLIPSTASH_TOKEN ?? '',
            alias: 't',
          },
        },
        commandArgs
      );

      const serverUrl = parsed.flags.server as string;
      const token = parsed.flags.token as string;

      if (serverUrl && token) {
        await listRemoteItems({ serverUrl, token });
      } else {
        initDb();

        const result = listItems({ limit: 1000 });

        console.table(result.items);
        console.log(`Total: ${result.total}`);
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
