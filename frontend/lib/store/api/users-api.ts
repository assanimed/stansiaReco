import { baseApi } from "./base-api";
import { PermissionRule } from "@/lib/api/auth";

export interface UserItem {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  permissions?: PermissionRule[];
}

export interface CreateUserPayload {
  email: string;
  full_name: string;
  password?: string;
  role: string;
  is_active?: boolean;
  permissions?: {
    resource: string;
    can_view: boolean;
    can_insert: boolean;
    can_update: boolean;
    can_delete: boolean;
  }[];
}

export interface UpdateUserPayload {
  email?: string;
  full_name?: string;
  password?: string;
  role?: string;
  is_active?: boolean;
  permissions?: {
    resource: string;
    can_view: boolean;
    can_insert: boolean;
    can_update: boolean;
    can_delete: boolean;
  }[];
}

export const usersApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getUsers: builder.query<UserItem[], void>({
      query: () => "/users",
      transformResponse: (response: { users: UserItem[] }) => response.users,
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "Users" as const, id })),
              { type: "Users", id: "LIST" },
            ]
          : [{ type: "Users", id: "LIST" }],
    }),

    getUserById: builder.query<UserItem, string>({
      query: (id) => `/users/${id}`,
      transformResponse: (response: { user: UserItem }) => response.user,
      providesTags: (result, error, id) => [{ type: "Users", id }],
    }),

    createUser: builder.mutation<UserItem, CreateUserPayload>({
      query: (payload) => ({
        url: "/users",
        method: "POST",
        body: payload,
      }),
      transformResponse: (response: { user: UserItem }) => response.user,
      invalidatesTags: [{ type: "Users", id: "LIST" }],
    }),

    updateUser: builder.mutation<UserItem, { id: string; payload: UpdateUserPayload }>({
      query: ({ id, payload }) => ({
        url: `/users/${id}`,
        method: "PUT",
        body: payload,
      }),
      transformResponse: (response: { user: UserItem }) => response.user,
      invalidatesTags: (result, error, { id }) => [
        { type: "Users", id },
        { type: "Users", id: "LIST" },
        "Auth", // Refresh auth in case the updated user is the currently logged-in user
      ],
    }),

    deleteUser: builder.mutation<void, string>({
      query: (id) => ({
        url: `/users/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, id) => [
        { type: "Users", id },
        { type: "Users", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetUsersQuery,
  useGetUserByIdQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
} = usersApi;
