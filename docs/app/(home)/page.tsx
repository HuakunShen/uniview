import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex flex-col justify-center text-center flex-1 p-6 md:p-12">
      <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
        Uniview
      </h1>
      <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-12 max-w-3xl mx-auto leading-relaxed">
        A universal plugin system for React plugins that render in any host
        framework.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-16 text-left">
        <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6 hover:border-blue-500 dark:hover:border-blue-400 transition-colors bg-white/50 dark:bg-white/5">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            ⚛️ Write Once, Render Anywhere
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Write plugins in React, render them in Svelte, Vue, or React hosts
            using a custom reconciler.
          </p>
        </div>
        <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6 hover:border-blue-500 dark:hover:border-blue-400 transition-colors bg-white/50 dark:bg-white/5">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            🛡️ Isolated Runtime
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Run plugins securely in Web Workers or on the server via Node.js,
            Deno, or Bun with full sandboxing.
          </p>
        </div>
        <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6 hover:border-blue-500 dark:hover:border-blue-400 transition-colors bg-white/50 dark:bg-white/5">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            🔌 Type-Safe RPC
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Built on{" "}
            <a
              href="https://github.com/kunkunsh/kkrpc"
              className="underline hover:text-blue-500"
              target="_blank"
              rel="noopener noreferrer"
            >
              kkrpc
            </a>{" "}
            for robust, type-safe communication between host and plugins.
          </p>
        </div>
        <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6 hover:border-blue-500 dark:hover:border-blue-400 transition-colors bg-white/50 dark:bg-white/5">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            🌐 Framework Agnostic
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Protocol-first architecture allows any framework to implement a host
            adapter.
          </p>
        </div>
      </div>

      <div>
        <Link
          href="/docs"
          className="inline-flex items-center justify-center bg-black dark:bg-white text-white dark:text-black px-8 py-3 rounded-full font-medium text-lg hover:opacity-90 transition-opacity shadow-lg"
        >
          Read the Documentation
        </Link>
      </div>
    </div>
  );
}
