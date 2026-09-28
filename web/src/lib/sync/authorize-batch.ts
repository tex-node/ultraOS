// Pure authorization-loop combinator - iterates a set of fixture ids, calling an injected
// permission-check callback for each, and returns the first AuthorizationError encountered (or
// null if every fixture is authorized). Split out from route.ts specifically so this loop's
// "reject the whole batch on the first unauthorized fixture, don't process any record" contract
// is unit-testable with a mock callback, without needing to mock NextAuth's real session
// resolution - see authorize-batch.test.ts.
export interface AuthorizedCheckError extends Error {
  readonly name: string;
}

export async function checkAllFixturesAuthorized(
  fixtureIds: Iterable<string>,
  checkPermission: (fixtureId: string) => Promise<void>,
  isAuthorizationError: (error: unknown) => error is AuthorizedCheckError,
): Promise<AuthorizedCheckError | null> {
  for (const fixtureId of fixtureIds) {
    try {
      await checkPermission(fixtureId);
    } catch (error) {
      if (isAuthorizationError(error)) return error;
      throw error;
    }
  }
  return null;
}
