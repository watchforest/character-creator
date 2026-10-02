// Minimal undo/redo stack. Commands are { undo(), redo() } and are pushed
// *after* the change has been applied.
export class History {
  constructor(onChange) {
    this.undoStack = [];
    this.redoStack = [];
    this.onChange = onChange;
  }
  push(cmd) {
    this.undoStack.push(cmd);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack.length = 0;
    this.onChange();
  }
  undo() {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
    this.onChange();
  }
  redo() {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.redo();
    this.undoStack.push(cmd);
    this.onChange();
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}
