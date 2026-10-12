"use client";

import { useState } from "react";

/**
 * 电影海报。
 *
 * 数据库里存的是豆瓣的图片地址，但豆瓣有防盗链，直接 <img src={豆瓣地址}> 会 403，
 * 所以统一走自己的代理 /api/images/proxy（见该文件注释）。
 *
 * 没有海报、或者代理也取不到时，退化成一块灰色 🎬 占位，保证卡片排版不塌。
 */
export function PosterImage({
	src,
	alt,
	className,
}: {
	src?: string | null;
	alt: string;
	className?: string;
}) {
	const [failed, setFailed] = useState(false);

	if (!src || failed) {
		return (
			<div
				className={`${className ?? ""} flex items-center justify-center bg-slate-100 text-3xl text-slate-400`}
				aria-label={alt}
				role="img"
			>
				🎬
			</div>
		);
	}

	return (
		// 用原生 img 而不是 next/image：图片已经由自建代理吐字节了，
		// 再套一层优化器没有收益，还要额外配 remotePatterns。
		// eslint-disable-next-line @next/next/no-img-element
		<img
			src={`/api/images/proxy?url=${encodeURIComponent(src)}`}
			alt={alt}
			loading="lazy"
			className={className}
			onError={() => setFailed(true)}
		/>
	);
}
