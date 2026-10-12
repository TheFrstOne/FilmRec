export enum TAG_TYPES {
	AUTH = "Auth",
	USER = "User",
	// 当前用户的收藏 / 看过 / 评分（GET /events/mine）。
	// 收藏和评分会改变推荐结果，所以它也兼作推荐列表的失效信号。
	MOVIE_EVENTS = "MovieEvents",
	// 管理后台数据（概览 / 模型版本）
	ADMIN = "Admin",
}
