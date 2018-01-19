const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Atspi = imports.gi.Atspi;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;
const Main = imports.ui.main;

const RightClick = new Lang.Class({
	Name: 'RightClick',
	Extends: Clutter.GestureAction,

	_init: function() {
		this.parent();

		this._threshold = Clutter.Settings.get_default().dndDragThreshold;
		this._duration = Clutter.Settings.get_default().longPressDuration;

		Atspi.init();

		this._mouseListener = Atspi.EventListener.new(Lang.bind(this, function(event) {
			switch (event.type) {
				case 'mouse:abs':
					this._onAbs();
					break;
				case 'mouse:button:1p':
					this._onB1P();
					break;
				case 'mouse:button:1r':
					this._onB1R();
			}
		}));
	},

	enable: function() {
		this._mouseListener.register('mouse');

		global.stage.add_action(this);
	},

	disable: function() {
		this._mouseListener.deregister('mouse');

		global.stage.remove_action(this);
	},

	vfunc_gesture_prepare: function(actor) {
		if (this.get_last_event(0).get_source_device().get_device_type() == Clutter.InputDeviceType.TOUCHSCREEN_DEVICE) {
			let [x, y] = this.get_press_coords(0);
			this._lastTouchX = Math.floor(x);
			this._lastTouchY = Math.floor(y);
		}
		else
			this._lastTouchX = this._lastTouchY = 0;
	},

	_onB1P: function() {
		this._activated = false;
		this._thresholdNotExceeded = true;
		[this._pressX, this._pressY] = global.get_pointer();

		this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._duration, Lang.bind(this, function() {
			this._timeoutId = null;

			let pickedActor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, this._pressX, this._pressY);
			if (!(pickedActor.get_parent() instanceof Meta.WindowActor) || this._lastTouchX != this._pressX || this._lastTouchY != this._pressY)
				return;

			this._windowCreatedId = global.display.connect('window-created', Lang.bind(this, function(display, window) {
				if ([Meta.WindowType.POPUP_MENU, Meta.WindowType.OVERRIDE_OTHER].indexOf(window.window_type) != -1)
					this._activated = false;
			}));

			this._activated = true;

			let actor = new St.BoxLayout({ style_class: 'ring', pivot_point: new Clutter.Point({ x: 0.5, y: 0.5 }) });
			Main.layoutManager.uiGroup.add_actor(actor);
			actor.set_position(this._pressX - (actor.width / 2), this._pressY - (actor.height / 2));		
			Tweener.addTween(actor, { scale_x: 5, scale_y: 5, opacity: 0, time: 0.4, transition: 'easeOutQuad', onComplete: actor.destroy });
		}));
	},

	_onAbs: function() {
		if (this._cursorChangedId) {
			Meta.CursorTracker.get_for_screen(global.screen).disconnect(this._cursorChangedId);
			this._cursorChangedId = null;
		}

		if(!this._thresholdNotExceeded)
			return;

		let [motionX, motionY] = global.get_pointer();

		if (Math.abs(motionX - this._pressX) > this._threshold ||
			Math.abs(motionY - this._pressY) > this._threshold) {
			this._thresholdNotExceeded = false;

			this._removeTimeout();
		}
	},

	_onB1R: function() {
		this._removeTimeout();

		if (this._activated && this._thresholdNotExceeded && this._lastTouchX == this._pressX && this._lastTouchY == this._pressY) {
			this._cursorChangedId = Meta.CursorTracker.get_for_screen(global.screen).connect('cursor-changed', function(){
				Meta.CursorTracker.get_for_screen(global.screen).set_pointer_visible(false);
			});

			Atspi.generate_mouse_event(this._pressX, this._pressY, 'b3c');
		}

		this._thresholdNotExceeded = false;
	},

	_removeTimeout: function() {
		if (this._timeoutId) {
			GLib.source_remove(this._timeoutId);
			this._timeoutId = null;
		}
		else
			global.display.disconnect(this._windowCreatedId);
	}
});

function init() {
    return new RightClick();
}
