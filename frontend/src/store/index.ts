import { configureStore } from "@reduxjs/toolkit";
import { usersApi } from "@/features/users/api/users.api";
import { moviesApi } from "@/features/movies/api/movies.api";
import { eventsApi } from "@/features/movies/api/events.api";
import { adminApi } from "@/features/admin/api/admin.api";

export const store = configureStore({
	reducer: {
		[usersApi.reducerPath]: usersApi.reducer,
		[moviesApi.reducerPath]: moviesApi.reducer,
		[eventsApi.reducerPath]: eventsApi.reducer,
		[adminApi.reducerPath]: adminApi.reducer,
	},
	middleware(getDefaultMiddleware) {
		return getDefaultMiddleware().concat(
			usersApi.middleware,
			moviesApi.middleware,
			eventsApi.middleware,
			adminApi.middleware,
		);
	},
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
