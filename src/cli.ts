#!/usr/bin/env node
import { typeFlag } from 'type-flag';
import { startServer } from './server.js';
import { startClient, listRemoteItems } from './client.js';
import { initDb, listItems, findUserByUsername, listUsers, listApiTokens, createApiToken, updateUserPassword } from './db.js';
import { hashPassword, generateToken } from './auth.js';

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
  clipstash admin    <subcommand>                        管理用户和令牌

选项:
  --server, -s  <url>    服务端地址 (默认: env CLIPSTASH_SERVER_URL 或 http://127.0.0.1:3879)
  --token, -t   <tok>    认证令牌 (默认: env CLIPSTASH_TOKEN)
  --port, -p    <port>   服务端端口 (默认: env CLIPSTASH_PORT 或 3879)
  --no-notify            禁用桌面通知
  --help, -h             显示帮助
`);
}

function printAdminUsage() {
  console.log(`
clipstash admin — 用户和令牌管理

用法:
  clipstash admin list                    列出所有用户和令牌
  clipstash admin reset <username>        重置用户密码
  clipstash admin token <username> [name] 为用户生成新令牌

选项:
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

    case 'admin': {
      const subcommand = commandArgs[0];

      if (!subcommand || subcommand === '--help' || subcommand === '-h') {
        printAdminUsage();
        process.exit(subcommand ? 0 : 1);
      }

      initDb();

      switch (subcommand) {
        case 'list': {
          const users = listUsers();

          if (users.length === 0) {
            console.log('暂无用户。');
            break;
          }

          console.log('用户列表:');

          for (const user of users) {
            const tokens = listApiTokens(user.id);
            const role = user.is_admin ? '(管理员)' : '';

            console.log(`  ${user.username} ${role} 创建于 ${user.created_at.slice(0, 10)}`);

            if (tokens.length === 0) {
              console.log('    (无令牌)');
            } else {
              for (const t of tokens) {
                const masked = t.token.slice(0, 12) + '...' + t.token.slice(-4);
                console.log(`    - ${t.name}: ${masked}`);
              }
            }
          }
          break;
        }

        case 'reset': {
          const username = commandArgs[1];

          if (!username) {
            console.error('请指定用户名: clipstash admin reset <username>');
            process.exit(1);
          }

          const user = findUserByUsername(username);

          if (!user) {
            console.error(`用户 "${username}" 不存在`);
            process.exit(1);
          }

          const newPassword = generateToken().slice(0, 16);
          const passwordHash = hashPassword(newPassword);

          updateUserPassword(user.id, passwordHash);

          console.log(`用户 ${username} 密码已重置:`);
          console.log(`  新密码: ${newPassword}`);
          console.log('  请使用新密码登录 WebUI');
          break;
        }

        case 'token': {
          const username = commandArgs[1];
          const name = commandArgs[2] || 'CLI generated token';

          if (!username) {
            console.error('请指定用户名: clipstash admin token <username> [name]');
            process.exit(1);
          }

          const user = findUserByUsername(username);

          if (!user) {
            console.error(`用户 "${username}" 不存在`);
            process.exit(1);
          }

          const token = generateToken();
          createApiToken(user.id, token, name);

          console.log(`为用户 ${username} 生成令牌 "${name}":`);
          console.log(`  令牌: ${token}`);
          console.log('  请立即复制并保存，关闭后无法再次查看');
          break;
        }

        default:
          console.error(`未知子命令: ${subcommand}`);
          printAdminUsage();
          process.exit(1);
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
