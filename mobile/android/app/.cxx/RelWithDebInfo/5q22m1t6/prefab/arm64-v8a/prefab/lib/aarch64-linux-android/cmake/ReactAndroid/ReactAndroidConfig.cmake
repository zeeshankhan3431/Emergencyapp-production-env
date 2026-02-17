if(NOT TARGET ReactAndroid::hermestooling)
add_library(ReactAndroid::hermestooling SHARED IMPORTED)
set_target_properties(ReactAndroid::hermestooling PROPERTIES
    IMPORTED_LOCATION "/home/zeeshan/.gradle/caches/9.0.0/transforms/0016748e1b87a62d9e7768547ff7cb7f/transformed/react-android-0.84.0-release/prefab/modules/hermestooling/libs/android.arm64-v8a/libhermestooling.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/zeeshan/.gradle/caches/9.0.0/transforms/0016748e1b87a62d9e7768547ff7cb7f/transformed/react-android-0.84.0-release/prefab/modules/hermestooling/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

if(NOT TARGET ReactAndroid::jsi)
add_library(ReactAndroid::jsi SHARED IMPORTED)
set_target_properties(ReactAndroid::jsi PROPERTIES
    IMPORTED_LOCATION "/home/zeeshan/.gradle/caches/9.0.0/transforms/0016748e1b87a62d9e7768547ff7cb7f/transformed/react-android-0.84.0-release/prefab/modules/jsi/libs/android.arm64-v8a/libjsi.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/zeeshan/.gradle/caches/9.0.0/transforms/0016748e1b87a62d9e7768547ff7cb7f/transformed/react-android-0.84.0-release/prefab/modules/jsi/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

if(NOT TARGET ReactAndroid::reactnative)
add_library(ReactAndroid::reactnative SHARED IMPORTED)
set_target_properties(ReactAndroid::reactnative PROPERTIES
    IMPORTED_LOCATION "/home/zeeshan/.gradle/caches/9.0.0/transforms/0016748e1b87a62d9e7768547ff7cb7f/transformed/react-android-0.84.0-release/prefab/modules/reactnative/libs/android.arm64-v8a/libreactnative.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/zeeshan/.gradle/caches/9.0.0/transforms/0016748e1b87a62d9e7768547ff7cb7f/transformed/react-android-0.84.0-release/prefab/modules/reactnative/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

