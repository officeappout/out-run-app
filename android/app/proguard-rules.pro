# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Preserve stack trace metadata, generic signatures, and annotation data.
# Required for Crashlytics remapped traces and any runtime-reflection serialisation.
-keepattributes Exceptions,InnerClasses,Signature,EnclosingMethod,*Annotation*,SourceFile,LineNumberTable

# Preserve AndroidX DataStore and Preferences to prevent Firebase Sessions runtime crashes
-keep class androidx.datastore.** { *; }
-keep interface androidx.datastore.** { *; }
-dontwarn androidx.datastore.**

# Auto-generated R8 missing rules
-dontwarn com.facebook.CallbackManager$Factory
-dontwarn com.facebook.CallbackManager
-dontwarn com.facebook.FacebookCallback
-dontwarn com.facebook.login.LoginManager
-dontwarn com.facebook.login.widget.LoginButton
-dontwarn com.google.android.gms.auth.GoogleAuthException
-dontwarn com.google.android.gms.auth.GoogleAuthUtil
-dontwarn com.google.android.gms.auth.api.signin.GoogleSignIn
-dontwarn com.google.android.gms.auth.api.signin.GoogleSignInClient

# Additional plugin missing rules
-dontwarn com.google.firebase.sessions.api.FirebaseSessionsDependencies
-dontwarn com.google.firebase.sessions.api.SessionSubscriber$Name
-dontwarn com.google.firebase.sessions.api.SessionSubscriber

# Protect Capawesome Auth Plugin
-keep class io.capawesome.capacitorjs.plugins.** { *; }
-dontwarn io.capawesome.capacitorjs.plugins.**

# Core Capacitor plugin namespace — geolocation, camera, network, keyboard, preferences, app
-keep class com.getcapacitor.** { *; }

# Health Connect alpha-channel AAR may not embed a complete consumer ProGuard config;
# data record types and permission classes are accessed reflectively by the SDK.
-keep class androidx.health.connect.** { *; }
-dontwarn androidx.health.connect.**
