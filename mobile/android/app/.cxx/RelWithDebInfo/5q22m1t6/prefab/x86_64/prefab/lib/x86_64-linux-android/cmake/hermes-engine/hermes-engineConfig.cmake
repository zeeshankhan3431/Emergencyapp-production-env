if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "/home/zeeshan/.gradle/caches/9.0.0/transforms/15c1cd3d1b4c5006012b7198c84a504c/transformed/hermes-android-250829098.0.7-release/prefab/modules/hermesvm/libs/android.x86_64/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/zeeshan/.gradle/caches/9.0.0/transforms/15c1cd3d1b4c5006012b7198c84a504c/transformed/hermes-android-250829098.0.7-release/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

