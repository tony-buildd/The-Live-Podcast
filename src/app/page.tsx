"use client";

import { useState } from "react";
import AddEpisodeModal from "@/components/AddEpisodeModal";

export default function Home() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 sm:px-6">
        <main className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
            Jump into conversations with your favorite podcasters
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            Add any YouTube podcast and let AI help you explore, summarize, and
            interact with the conversation like never before.
          </p>
          <div className="mt-10">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center rounded-full bg-zinc-900 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Add a Podcast
            </button>
          </div>
        </main>
      </div>

      <AddEpisodeModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
