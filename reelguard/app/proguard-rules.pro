# kotlinx.serialization: keep generated serializers for our @Serializable models.
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class com.reelguard.app.** {
    *** Companion;
}
-keepclasseswithmembers class com.reelguard.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.reelguard.app.**$$serializer { *; }
