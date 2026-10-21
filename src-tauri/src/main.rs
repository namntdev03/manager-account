// Ẩn cửa sổ console trên Windows khi chạy bản release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    manager_account_lib::run()
}
