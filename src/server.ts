import { App } from '@/app';
import { ValidateEnv } from '@utils/validateEnv';
import { FarcasterRoute } from './routes/farcaster.route';
import { init, fetchQueryWithPagination } from '@airstack/node';
import { AIRSTACK_API_KEY } from '@/config';

init(AIRSTACK_API_KEY);

ValidateEnv();

const query = `
query MyQuery($cursor: String) {
  degens: TokenBalances(
    input: {filter: {tokenAddress: {_eq: "0x4ed4e862860bed51a9570b96d89af5e1b0efefed"}, formattedAmount: {_gt: 3000000}}, blockchain: base, limit: 200, cursor: $cursor}
  ) {
    TokenBalance {
      owner {
        socials(input: {filter: {dappName: {_eq: farcaster}}}) {
          userId
        }
      }
    }
    pageInfo {
      nextCursor
      hasNextPage
    }
  }
}
`;

interface User {
  userId: string;
}

interface TokenBalance {
  owner: { socials: User[] | null };
}

interface QueryResult {
  degens: { TokenBalance: TokenBalance[] };
}

const fidsFromQueryResponse = (balances: TokenBalance[]) => {
  return balances
    .filter(({ owner }) => {
      return owner.socials?.length > 0;
    })
    .flatMap(({ owner }) => owner.socials.map(s => BigInt(s.userId)));
};

type GqlResponse = Omit<Awaited<ReturnType<typeof fetchQueryWithPagination>>, 'data'> & { data: QueryResult };

const eligibleFids = async () => {
  let { data, hasNextPage, getNextPage }: GqlResponse = await fetchQueryWithPagination(query);

  let fids: bigint[] = fidsFromQueryResponse(data.degens.TokenBalance);
  while (hasNextPage) {
    ({ data, hasNextPage } = await getNextPage());

    fids = [...fids, ...fidsFromQueryResponse(data.degens.TokenBalance)];
  }

  return fids;
};

const main = async () => {
  const fids = await eligibleFids();
  const app = new App([new FarcasterRoute(fids)]);

  app.listen();
};

main();
