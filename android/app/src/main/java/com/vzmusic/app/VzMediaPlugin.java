package com.vzmusic.app;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS bridge: VzMedia.start({ title, artist }) / VzMedia.stop() — see lib/native/media.ts */
@CapacitorPlugin(name = "VzMedia")
public class VzMediaPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        Intent i = new Intent(getContext(), PlaybackService.class);
        i.putExtra("title", call.getString("title", "vzMusic"));
        i.putExtra("artist", call.getString("artist", ""));
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(i);
            else getContext().startService(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), PlaybackService.class));
        call.resolve();
    }
}
