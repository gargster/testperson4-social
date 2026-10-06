const profileName = document.querySelector("#profile-name");
const profileHandle = document.querySelector("#profile-handle");
const profileBio = document.querySelector("#profile-bio");
const repositoryLink = document.querySelector("#repository-link");
const feedStatus = document.querySelector("#feed-status");
const postList = document.querySelector("#post-list");
const feedFilter = document.querySelector("#feed-filter");

let currentFeed = null;

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function authorName(publicKey, profiles) {
  return profiles[publicKey] || publicKey || "Unknown author";
}

function validAction(action) {
  return action !== null
    && typeof action === "object"
    && typeof action.id === "string"
    && typeof action.author === "string"
    && typeof action.created === "string"
    && typeof action.type === "string";
}

function renderProfile(feed) {
  const profile = feed.profile;
  const displayName = profile.displayName || profile.handle || "Social feed";

  document.title = `${displayName} · Social feed`;
  profileName.textContent = displayName;
  profileHandle.textContent = profile.handle ? `@${profile.handle}` : "";
  profileBio.textContent = profile.bio || "";
  profileBio.hidden = !profile.bio;

  if (typeof profile.repoURL === "string" && profile.repoURL.startsWith("https://")) {
    repositoryLink.href = profile.repoURL;
    repositoryLink.hidden = false;
  }
}

function renderPost(post, indexed, profiles) {
  const card = createElement("article", "post-card");
  const header = createElement("header", "post-header");
  const author = createElement(
    "h3",
    "post-author",
    authorName(post.author, profiles)
  );
  const timestamp = createElement("time", "post-time", post.created);
  const parsedDate = new Date(post.created);
  if (!Number.isNaN(parsedDate.getTime())) {
    timestamp.dateTime = parsedDate.toISOString();
    timestamp.textContent = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsedDate);
  }
  header.append(author, timestamp);
  card.append(header);

  card.append(createElement("p", "post-content", post.content || ""));

  const likes = indexed.likesByTarget.get(post.id) || [];
  const uniqueLikerKeys = new Set(likes.map((like) => like.author));
  if (uniqueLikerKeys.size > 0) {
    const likerNames = [...uniqueLikerKeys].map((key) => authorName(key, profiles));
    card.append(
      createElement(
        "p",
        "post-likes",
        `♥ ${uniqueLikerKeys.size} ${uniqueLikerKeys.size === 1 ? "like" : "likes"} · ${likerNames.join(", ")}`
      )
    );
  }

  const replies = indexed.repliesByTarget.get(post.id) || [];
  if (replies.length > 0) {
    const replyList = createElement("div", "post-replies");
    for (const reply of replies) {
      const item = createElement("p", "reply");
      item.append(
        createElement("span", "reply-author", `${authorName(reply.author, profiles)}: `),
        document.createTextNode(reply.content || "")
      );
      replyList.append(item);
    }
    card.append(replyList);
  }

  return card;
}

function renderFeed() {
  if (!currentFeed) return;

  postList.replaceChildren();
  const { posts, likesByTarget, repliesByTarget, follows } = currentFeed.indexed;
  const followedKeys = new Set(
    follows
      .filter((follow) => follow.author === currentFeed.profile.publicKey)
      .map((follow) => follow.target)
  );

  const visiblePosts = posts
    .filter((post) => (
      feedFilter.value !== "following" || followedKeys.has(post.author)
    ))
    .sort((left, right) => left.created.localeCompare(right.created));

  if (feedFilter.value === "following" && followedKeys.size === 0) {
    feedStatus.textContent = "This profile does not have any followed authors yet.";
    return;
  }

  if (visiblePosts.length === 0) {
    feedStatus.textContent = feedFilter.value === "following"
      ? "No posts from followed authors are available in this feed yet."
      : "No posts are available in this feed yet.";
    return;
  }

  feedStatus.textContent = "";
  for (const post of visiblePosts) {
    postList.append(
      renderPost(post, { likesByTarget, repliesByTarget }, currentFeed.profiles)
    );
  }
}

function prepareFeed(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Feed data must be a JSON object.");
  }
  if (!data.profile || typeof data.profile !== "object") {
    throw new Error("Feed data is missing its profile object.");
  }
  if (!Array.isArray(data.actions)) {
    throw new Error("Feed data is missing its actions array.");
  }

  const profiles = data.profiles && typeof data.profiles === "object"
    ? data.profiles
    : {};
  const actions = data.actions.filter(validAction);
  const postsById = new Map();
  const likesByTarget = new Map();
  const repliesByTarget = new Map();
  const follows = [];

  for (const action of actions) {
    if (action.type === "post") {
      postsById.set(action.id, action);
    } else if (action.type === "like" && typeof action.target === "string") {
      const likes = likesByTarget.get(action.target) || [];
      likes.push(action);
      likesByTarget.set(action.target, likes);
    } else if (action.type === "reply" && typeof action.inReplyTo === "string") {
      const replies = repliesByTarget.get(action.inReplyTo) || [];
      replies.push(action);
      repliesByTarget.set(action.inReplyTo, replies);
    } else if (action.type === "follow" && typeof action.target === "string") {
      follows.push(action);
    }
  }

  return {
    profile: data.profile,
    profiles,
    indexed: {
      posts: [...postsById.values()],
      likesByTarget,
      repliesByTarget,
      follows,
    },
  };
}

async function loadFeed() {
  try {
    const response = await fetch("./feed.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load feed.json (HTTP ${response.status}).`);
    }

    currentFeed = prepareFeed(await response.json());
    renderProfile(currentFeed);
    feedFilter.disabled = false;
    renderFeed();
  } catch (error) {
    profileName.textContent = "Feed unavailable";
    feedStatus.textContent = `${error.message} Publish a feed.json file beside index.html to display this site.`;
  }
}

feedFilter.addEventListener("change", renderFeed);
loadFeed();
