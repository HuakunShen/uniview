这是一个用于写插件的项目，旨在不同的环境里都能运行插件代码，比如nodejs，deno，bun，web worker。插件写react，host通过不同的底层协议控制host app里的UI。kkrpc是底层的rpc协议，支持各种环境之间协议的RPC通信。
When creating a new ts package, 优先用pnpm create tsdown@latest 来create一个tsdown template。tsdown有普通ts，react，svelte 等好几种template。千万不要自己想当然去写一个ts package，配置可能出错还浪费token。

```bash
pnpm create tsdown@latest -h
create-tsdown/0.20.1

Usage:
  $ create-tsdown [path]

Commands:
  [path]  Create a tsdown project

For more info, run any command with the `--help` flag:
  $ create-tsdown --help

Options:
  -t, --template <template>  Available templates: default, minimal, vue, react, react-compiler, solid, svelte
  -v, --version              Display version number
  -h, --help                 Display this message
```

## References

- Use context 7 or zread or deepwiki MCP to get docs and details about some libraries you are using. e.g. kkrpc, react-reconciler, etc.
- Some important references are added as submodules in `./vendors`, 可以参考完整源代码。
