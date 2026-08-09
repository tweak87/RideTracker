plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "de.ridetracker"
    compileSdk = 35

    defaultConfig {
        applicationId = "de.ridetracker"
        minSdk = 21
        targetSdk = 35
        versionCode = 202608093
        versionName = "2026.08.09.3"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        manifestPlaceholders["appLabel"] = "RideTracker"
    }

    buildFeatures { compose = true }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        create("fireTest") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".fire8v7"
            versionNameSuffix = "-fire"
            matchingFallbacks += listOf("debug")
            manifestPlaceholders["appLabel"] = "RideTracker FIRE 8 v7"
            ndk { abiFilters += listOf("armeabi-v7a", "arm64-v8a") }
        }
        create("deviceTest") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".devicev7"
            versionNameSuffix = "-device"
            matchingFallbacks += listOf("debug")
            manifestPlaceholders["appLabel"] = "RideTracker DEVICE v7"
        }
    }

    packaging {
        // Fire OS package installers are most reliable when native libraries use the
        // traditional compressed/extracted layout instead of direct APK mmap loading.
        jniLibs.useLegacyPackaging = true
    }

    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs += "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api"
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
        warningsAsErrors = false
        htmlReport = true
        xmlReport = true
    }

    testOptions { unitTests.isReturnDefaultValues = true }
}

kotlin { jvmToolchain(17) }

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    val cameraXVersion = "1.4.1"
    implementation("androidx.camera:camera-camera2:$cameraXVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraXVersion")
    implementation("androidx.camera:camera-video:$cameraXVersion")
    implementation("androidx.camera:camera-view:$cameraXVersion")
    implementation("androidx.camera:camera-effects:$cameraXVersion")

    testImplementation("junit:junit:4.13.2")
}
