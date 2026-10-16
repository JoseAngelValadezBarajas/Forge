use std::io;
use std::process::Child;

#[cfg(windows)]
mod platform {
    use super::*;
    use std::ffi::OsStr;
    use std::iter::once;
    use std::mem::{size_of, zeroed};
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::io::AsRawHandle;
    use std::ptr::null;
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE,
    };
    use windows_sys::Win32::System::JobObjects::{
        CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{AssignProcessToJobObject, CreateMutexW};
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK};

    pub fn show_already_running() {
        let title: Vec<u16> = OsStr::new("Forge")
            .encode_wide()
            .chain(once(0))
            .collect();
        let message: Vec<u16> = OsStr::new("Forge is already running in this Windows session.")
            .encode_wide()
            .chain(once(0))
            .collect();
        // SAFETY: both message buffers are null-terminated and remain valid during the call.
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                message.as_ptr(),
                title.as_ptr(),
                MB_OK | MB_ICONINFORMATION,
            );
        }
    }

    pub struct SingleInstanceLock(usize);

    unsafe impl Send for SingleInstanceLock {}

    impl SingleInstanceLock {
        pub fn acquire() -> io::Result<Self> {
            let name: Vec<u16> = OsStr::new("Local\\ForgeDesktopAlpha")
                .encode_wide()
                .chain(once(0))
                .collect();
            // SAFETY: the name buffer is null-terminated and valid for the duration of the call.
            let handle = unsafe { CreateMutexW(null(), 0, name.as_ptr()) };
            if handle.is_null() {
                return Err(io::Error::last_os_error());
            }
            // SAFETY: GetLastError is thread-local and immediately follows CreateMutexW.
            if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
                // SAFETY: CreateMutexW returned a valid handle owned by this process.
                unsafe { CloseHandle(handle) };
                return Err(io::Error::new(
                    io::ErrorKind::AlreadyExists,
                    "Forge is already running in this Windows session",
                ));
            }
            Ok(Self(handle as usize))
        }
    }

    impl Drop for SingleInstanceLock {
        fn drop(&mut self) {
            // SAFETY: this wrapper exclusively owns the live kernel handle.
            unsafe { CloseHandle(self.0 as HANDLE) };
        }
    }

    pub struct OwnedJob(usize);

    unsafe impl Send for OwnedJob {}

    impl OwnedJob {
        pub fn assign(child: &Child) -> io::Result<Self> {
            // SAFETY: null security attributes and name request a private unnamed job object.
            let handle = unsafe { CreateJobObjectW(null(), null()) };
            if handle.is_null() {
                return Err(io::Error::last_os_error());
            }
            // SAFETY: zero is a valid default initialization for this Win32 POD structure.
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { zeroed() };
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            // SAFETY: `limits` is initialized and the buffer length matches its exact Rust type.
            let configured = unsafe {
                SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
            };
            if configured == 0 {
                // SAFETY: the handle was created above and is still owned here.
                unsafe { CloseHandle(handle) };
                return Err(io::Error::last_os_error());
            }
            // SAFETY: Child owns a live process handle; the job handle is valid and configured.
            let assigned = unsafe {
                AssignProcessToJobObject(handle, child.as_raw_handle() as HANDLE)
            };
            if assigned == 0 {
                // SAFETY: the handle was created above and is still owned here.
                unsafe { CloseHandle(handle) };
                return Err(io::Error::last_os_error());
            }
            Ok(Self(handle as usize))
        }

        pub fn terminate(&self) -> io::Result<()> {
            // SAFETY: this wrapper owns a valid job handle.
            if unsafe { TerminateJobObject(self.0 as HANDLE, 1) } == 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        }
    }

    impl Drop for OwnedJob {
        fn drop(&mut self) {
            // Closing the last handle terminates this app-owned job because the kill-on-close
            // limit was configured before the child was assigned.
            // SAFETY: this wrapper exclusively owns the live job handle.
            unsafe { CloseHandle(self.0 as HANDLE) };
        }
    }

    pub use OwnedJob as PlatformOwnedJob;
    pub use SingleInstanceLock as PlatformSingleInstanceLock;
}

#[cfg(windows)]
pub use platform::{PlatformOwnedJob as OwnedJob, PlatformSingleInstanceLock as SingleInstanceLock};

#[cfg(windows)]
pub use platform::show_already_running;

#[cfg(not(windows))]
pub struct SingleInstanceLock;

#[cfg(not(windows))]
impl SingleInstanceLock {
    pub fn acquire() -> io::Result<Self> {
        Ok(Self)
    }
}

#[cfg(not(windows))]
pub struct OwnedJob;

#[cfg(not(windows))]
impl OwnedJob {
    pub fn assign(_: &Child) -> io::Result<Self> {
        Ok(Self)
    }

    pub fn terminate(&self) -> io::Result<()> {
        Ok(())
    }
}

#[cfg(not(windows))]
pub fn show_already_running() {}
