import { useEffect, useState } from 'react';
import { fetchContent, type FeedEntry } from '../lib/content';

export type ContentState = {
  /** 'unavailable' means the feed failed; the built-in content still renders. */
  status: 'loading' | 'ready' | 'unavailable';
  entries: FeedEntry[];
};

/**
 * The sheet content as a render state.
 *
 * It starts on 'loading' so a detail page does not flash its not-found state
 * before the sheet has had a chance to answer. The request is shared across
 * every consumer (see fetchContent), so the list and the page it links to do not
 * each pay for it.
 */
export function useContent(): ContentState {
  const [state, setState] = useState<ContentState>({ status: 'loading', entries: [] });

  useEffect(() => {
    let active = true;
    void fetchContent().then((entries) => {
      if (!active) return;
      setState(
        entries === null
          ? { status: 'unavailable', entries: [] }
          : { status: 'ready', entries },
      );
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
