import { useEffect, useState } from 'react';
import { fetchLivePosts, type LiveFeed } from '../lib/published';

/**
 * The manager-published posts as a render state.
 *
 * It starts on 'loading' for the same reason `useContent` does: a detail page
 * must not flash its not-found state before the feed has had a chance to answer.
 * The request itself is shared (see `fetchLivePosts`), so the list page and the
 * page it links to do not each pay for it.
 */
export function useLivePosts(): LiveFeed {
  const [state, setState] = useState<LiveFeed>({ status: 'loading', posts: [] });

  useEffect(() => {
    let active = true;
    void fetchLivePosts().then((feed) => {
      if (active) setState(feed);
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
