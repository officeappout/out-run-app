package co.il.appout.outrun;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

/**
 * "שמירה לגלריה" on Android — writes a share image into the public
 * Pictures/OUT folder through MediaStore.
 *
 * Android 10+ (API 29+): an app may insert its OWN files into the shared
 * Pictures collection with no storage permission at all (scoped storage), so
 * the manifest stays free of READ_MEDIA_* / WRITE_EXTERNAL_STORAGE (Google
 * Play photo-permission policy). The bytes are written as-is — no bitmap
 * re-encode — so PNG transparency survives.
 *
 * Below API 29 a permission-free public write is impossible; the call rejects
 * with code "UNSUPPORTED" and the web layer falls back to the share sheet.
 *
 * JS: registerPlugin('SaveToGallery') — see
 * src/features/social/services/save-to-gallery-plugin.ts.
 */
@CapacitorPlugin(name = "SaveToGallery")
public class SaveToGalleryPlugin extends Plugin {

    private static final String ALBUM = "OUT";

    @PluginMethod
    public void saveImage(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Saving to the gallery needs Android 10 or newer", "UNSUPPORTED");
            return;
        }

        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("Missing image data", "INVALID_INPUT");
            return;
        }

        String mimeType = call.getString("mimeType");
        int comma = data.indexOf(',');
        if (data.startsWith("data:") && comma > 0) {
            // "data:image/png;base64,...." — the header wins over a missing mimeType.
            if (mimeType == null) {
                int semi = data.indexOf(';');
                if (semi > 5 && semi < comma) mimeType = data.substring(5, semi);
            }
            data = data.substring(comma + 1);
        }
        if (!"image/jpeg".equals(mimeType)) mimeType = "image/png";

        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Image data is not valid base64", "INVALID_INPUT", e);
            return;
        }

        String fileName = displayName(call.getString("fileName"), mimeType);
        ContentResolver resolver = getContext().getContentResolver();

        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + ALBUM);
        values.put(MediaStore.Images.Media.DATE_TAKEN, System.currentTimeMillis());
        values.put(MediaStore.Images.Media.IS_PENDING, 1);

        Uri collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        Uri item = null;
        try {
            item = resolver.insert(collection, values);
            if (item == null) throw new IllegalStateException("MediaStore insert returned null");

            try (OutputStream out = resolver.openOutputStream(item)) {
                if (out == null) throw new IllegalStateException("Could not open the gallery file");
                out.write(bytes);
            }

            ContentValues done = new ContentValues();
            done.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(item, done, null, null);

            JSObject ret = new JSObject();
            ret.put("uri", item.toString());
            call.resolve(ret);
        } catch (Exception e) {
            if (item != null) {
                try {
                    resolver.delete(item, null, null);
                } catch (Exception ignored) {
                    // best effort — a pending row is cleaned up by the system
                }
            }
            call.reject("Could not save the image", "SAVE_FAILED", e);
        }
    }

    /** Safe display name with an extension that matches the MIME type. */
    private static String displayName(String requested, String mimeType) {
        String ext = "image/jpeg".equals(mimeType) ? ".jpg" : ".png";
        String base = requested == null ? "" : requested.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        int dot = base.lastIndexOf('.');
        if (dot > 0) base = base.substring(0, dot);
        if (base.isEmpty()) base = "OUT-" + System.currentTimeMillis();
        return base + ext;
    }
}
