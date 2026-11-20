//! Chance for tasks that should look like a person did them: picks, orders and
//! pauses that differ from one account to the next.

use std::hash::{BuildHasher, Hasher, RandomState};

/// A number under `below`, which mustn't be 0.
pub(crate) fn below(below: usize) -> usize {
    (RandomState::new().build_hasher().finish() % below as u64) as usize
}

/// A number from `least` to `most`, both included.
pub(crate) fn between(least: usize, most: usize) -> usize {
    least + below(most.saturating_sub(least) + 1)
}

/// The items in an order made with `pick`, which gives a number under the one
/// it's handed.
pub(crate) fn shuffled<T: Clone>(items: &[T], pick: &mut impl FnMut(usize) -> usize) -> Vec<T> {
    let mut items = items.to_vec();
    for last in (1..items.len()).rev() {
        items.swap(last, pick(last + 1));
    }
    items
}
