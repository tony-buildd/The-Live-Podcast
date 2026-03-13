"use client";

import Image from "next/image";
import Link from "next/link";

interface EpisodeCardProps {
  episode: {
    id: string;
    title: string;
    youtubeId: string;
    thumbnailUrl?: string | null;
    description?: string | null;
    podcaster: {
      name: string;
    };
  };
}

export default function EpisodeCard({ episode }: EpisodeCardProps) {
  const thumbnail =
    episode.thumbnailUrl ??
    `https://img.youtube.com/vi/${episode.youtubeId}/mqdefault.jpg`;

  return (
    <Link
      href={`/watch/${episode.id}`}
      className="group block overflow-hidden rounded-xl border border-zinc-200 bg-white transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:shadow-zinc-800/40"
    >
      <div className="relative aspect-video w-full overflow-hidden">
        <Image
          src={thumbnail}
          alt={episode.title}
          fill
          className="object-cover transition-transform duration-200 group-hover:scale-105"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          loading="lazy"
          unoptimized
        />
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
          {episode.title}
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {episode.podcaster.name}
        </p>
      </div>
    </Link>
  );
}
