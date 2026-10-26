import { baseApi } from "./base-api";
import { CredentialItem, CreateCredentialPayload } from "@/lib/api/credentials";

export const credentialsApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getCredentials: builder.query<CredentialItem[], { type?: string } | void>({
      query: (params) => {
        const queryParams = new URLSearchParams();
        if (params?.type) {
          queryParams.set("type", params.type);
        }
        const qs = queryParams.toString();
        return `/credentials${qs ? `?${qs}` : ""}`;
      },
      transformResponse: (res: { credentials: CredentialItem[] }) => res.credentials || [],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "Credentials" as const, id })),
              { type: "Credentials", id: "LIST" },
            ]
          : [{ type: "Credentials", id: "LIST" }],
    }),

    getCredentialById: builder.query<CredentialItem, string>({
      query: (id) => `/credentials/${id}`,
      transformResponse: (res: { credential: CredentialItem }) => res.credential,
      providesTags: (result, error, id) => [{ type: "Credentials", id }],
    }),

    createCredential: builder.mutation<CredentialItem, CreateCredentialPayload>({
      query: (body) => ({
        url: "/credentials",
        method: "POST",
        body,
      }),
      transformResponse: (res: { credential: CredentialItem }) => res.credential,
      invalidatesTags: [{ type: "Credentials", id: "LIST" }],
    }),

    deleteCredential: builder.mutation<void, string>({
      query: (id) => ({
        url: `/credentials/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, id) => [
        { type: "Credentials", id },
        { type: "Credentials", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetCredentialsQuery,
  useGetCredentialByIdQuery,
  useCreateCredentialMutation,
  useDeleteCredentialMutation,
} = credentialsApi;
