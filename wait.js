
var Wait = function (complete) {
  if (complete) this.oncomplete = complete;
};

Wait.prototype = {
  debug: false,
  log: function () {
    if (!this.debug) return;
    var args = [].slice.apply(arguments);
    if (typeof args[0] == 'string') args[0] = '[wait] ' + args[0];
    else args.unshift('[wait]');
    console.log.apply(console, args);
  },
  oncomplete: function () {},
  complete: function (fn) {
    if (fn === undefined) {
      this.oncomplete();
    } else {
      this.oncomplete = fn;
    }
  },
  tasks: 0,
  done: function () {
    this.tasks--;
    this.log('tasks left: ' + this.tasks);
    if (this.tasks == 0) {
      this.log('triggering complete')
      this.complete();
    }
  },
  until: function (task, context) {
    var self = this,
        name = (arguments.callee.name || 'anonymous');
    this.tasks++;

    context || (context = this);
    this.log('new task: %s, total: %d', (arguments.callee.name || 'anonymous'), this.tasks);
    return function () {
      self.log('running %s', name);
      var ret,
          args = [].slice.apply(arguments);
      // args.push(self.done);
      if (task) {
        try {
          ret = task.apply(context, args);
        } catch (e) {
          console.error(e);
        }
      }
      self.done();
      return ret;
    };
  },
  run: function (task, context) {
    return this.add(task, context)();
  }
};

if (typeof module !== undefined && module.exports !== undefined) {
  module.exports = Wait;
}