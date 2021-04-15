let socket;

Hooks.once("init", () => {
  game.pf1.applications.ActorSheetPF.prototype._onItemGive = _onItemGive;
});

Hooks.once("socketlib.ready", () => {
  socket = socketlib.registerModule("pf1-enhanced-gifting");
  socket.register("moveItem", _socketMoveItem);
});

async function _onItemGive(event) {
  event.preventDefault();

  const itemId = event.currentTarget.closest(".item").dataset.itemId;
  const item = this.actor.items.find((o) => o._id === itemId);

  const targets = game.actors.entities.filter((o) => o.hasPerm(game.user, "OWNER") && o !== this.actor);
  targets.push(...this.actor.items.filter((o) => o.type === "container"));
  targets.push(...game.items.entities.filter((o) => o.hasPerm(game.user, "OWNER") && o.type === "container"));
  // TODO Check if GM is connected?
  targets.push(...game.actors.entities.filter(o => o.data.type === "character" && !o.hasPerm(game.user) && hasOtherPlayerPermission(o, "OWNER") && o !== this.actor));
  const targetData = await game.pf1.utils.dialogGetActor(`Give item to actor`, targets);

  if (!targetData) return;
  let target;
  let socketRequired = false;
  if (targetData.type === "actor") {
    target = game.actors.entities.find((o) => o._id === targetData.id);
    socketRequired = !target.hasPerm(game.user, "OWNER");
  } else if (targetData.type === "item") {
    target = this.actor.items.find((o) => o._id === targetData.id);
    if (!target) {
      target = game.items.entities.find((o) => o._id === targetData.id);
    }
  }

  if (socketRequired) {
    if (!isGMConnected()) {
      ui.notifications.error("Cannot give item to an unowned character while no GM is connected.")
      return;
    }
    await moveItem(this.actor, item, target);
  }
  else if (target && target !== item) {
    const itemData = item.data;
    if (target instanceof Actor) {
      await target.createOwnedItem(itemData);
    } else if (target instanceof Item) {
      await target.createContainerContent(itemData);
    }
    await this.actor.deleteOwnedItem(item._id);
  }
}

function hasOtherPlayerPermission(o, permission) {
  return game.users.filter(user => !user.isGM && user.id !== game.userId).some(user => o.hasPerm(user, permission));
}

function isGMConnected() {
  return Boolean(game.users.find(user => user.active && user.isGM));
}

async function moveItem(source, item, target) {
  const sourceId = source.id;
  const itemId = item._id;
  const targetId = target.id;
  socket.executeAsGM(_socketMoveItem, sourceId, itemId, targetId);
}

async function _socketMoveItem(sourceId, itemId, targetId) {
  const source = game.actors.get(sourceId);
  const item = source.items.find((o) => o._id === itemId);
  const target = game.actors.get(targetId);
  const itemData = item.data;
  await target.createOwnedItem(itemData);
  await source.deleteOwnedItem(item._id);
}
